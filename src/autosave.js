// Serializes cloud writes so rapid edits cannot reuse an outdated revision.
export class DraftAutosave {
  constructor({ local, remote, status, metadata, delay = 700 }) {
    Object.assign(this, { local, remote, status, metadata, delay });
    this.latest = new Map();
    this.meta = new Map();
    this.pending = new Map();
    this.failed = new Map();
    this.localLane = Promise.resolve();
    this.localErrors = new Set();
    this.timer = null;
    this.running = null;
  }
  key(owner, id) {
    return owner + ":" + id;
  }
  restore(item, owner) {
    this.latest.set(item.id, structuredClone(item));
    if (owner && item.cloudOwner === owner)
      this.meta.set(this.key(owner, item.id), {
        cloudOwner: owner,
        revision: item.revision,
      });
    this.failed.delete(item.id);
    this.pending.delete(item.id);
  }
  persist(id) {
    const write = async () => {
      const latest = this.latest.get(id);
      if (!latest) return;
      const item = structuredClone(latest);
      try {
        await this.local(item);
        this.localErrors.delete(id);
      } catch (error) {
        this.localErrors.add(id);
        throw error;
      }
    };
    const done = this.localLane.then(write, write);
    this.localLane = done.catch(() => {});
    return done;
  }
  enqueue(item, owner, { immediate = false } = {}) {
    const copy = structuredClone(item),
      id = copy.id;
    if (
      owner &&
      copy.cloudOwner === owner &&
      !this.meta.has(this.key(owner, id))
    )
      this.meta.set(this.key(owner, id), {
        cloudOwner: owner,
        revision: copy.revision,
      });
    const meta = owner && this.meta.get(this.key(owner, id));
    if (meta) Object.assign(copy, meta);
    this.latest.set(id, copy);
    this.status(id, "saving-local");
    const saved = this.persist(id);
    saved.then(
      () => {
        if (!owner) this.status(id, "local-only");
        else if (!copy.values?.make?.trim() || !copy.values?.model?.trim())
          this.status(id, "needs-details");
      },
      () => this.status(id, "local-error"),
    );
    if (owner && copy.values?.make?.trim() && copy.values?.model?.trim()) {
      if (copy.cloudOwner && copy.cloudOwner !== owner) {
        this.status(id, "account-mismatch");
        return saved.catch(() => {});
      }
      this.pending.set(id, { owner });
      this.failed.delete(id);
      this.status(id, "pending");
      clearTimeout(this.timer);
      if (immediate) return this.flush();
      this.timer = setTimeout(() => this.flush(), this.delay);
    }
    if (!copy.values?.make?.trim() || !copy.values?.model?.trim())
      this.pending.delete(id);
    return saved.catch(() => {});
  }
  async flush() {
    clearTimeout(this.timer);
    if (this.running) return this.running;
    this.running = this.drain();
    try {
      await this.running;
    } finally {
      this.running = null;
    }
  }
  async drain() {
    while (this.pending.size) {
      const [id, task] = this.pending.entries().next().value;
      this.pending.delete(id);
      const item = structuredClone(this.latest.get(id));
      const meta = this.meta.get(this.key(task.owner, id));
      const revision =
        meta?.revision ??
        (item.cloudOwner === task.owner ? item.revision : 0) ??
        0;
      this.status(id, "saving-cloud");
      try {
        const result = await this.remote(item, task.owner, revision);
        const metadata = {
          cloudOwner: task.owner,
          revision: result.revision,
          cloudSavedLocalUpdated: item.updated,
        };
        this.meta.set(this.key(task.owner, id), metadata);
        Object.assign(this.latest.get(id), metadata);
        this.metadata(id, metadata);
        // Persist metadata with the newest content, never an older in-flight snapshot.
        await this.persist(id).catch(() => this.status(id, "local-error"));
        if (!this.pending.has(id)) {
          const latest = this.latest.get(id);
          this.status(
            id,
            latest.values?.make?.trim() && latest.values?.model?.trim()
              ? "cloud-saved"
              : "needs-details",
          );
        }
      } catch (error) {
        await this.localLane;
        this.pending.delete(id);
        this.failed.set(id, task);
        this.status(
          id,
          this.localErrors.has(id)
            ? "save-error"
            : error.status === 409
              ? "conflict"
              : error.status === 401
                ? "signed-out"
                : "cloud-error",
          error,
        );
      }
    }
  }
  retry() {
    for (const [id, task] of this.failed) this.pending.set(id, task);
    this.failed.clear();
    return this.flush();
  }
  async settled() {
    await this.flush();
    await this.localLane;
  }
}
