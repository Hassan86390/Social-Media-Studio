import { test } from "node:test";
import assert from "node:assert/strict";
import { DraftAutosave } from "../src/autosave.js";
const item = (caption = "first") => ({
  id: "car-1",
  values: { make: "Toyota", model: "Corolla" },
  outputs: { caption },
  approved: {},
  photos: [],
  updated: caption,
});
const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
};
test("edits during a cloud write use the returned revision and retain newest local content", async () => {
  const gate = deferred(),
    started = deferred(),
    calls = [],
    local = [],
    states = [];
  const saver = new DraftAutosave({
    delay: 10000,
    local: async (x) => local.push(structuredClone(x)),
    remote: async (x, owner, revision) => {
      calls.push({ x, revision });
      if (calls.length === 1) {
        started.resolve();
        await gate.promise;
      }
      return { revision: revision + 1 };
    },
    status: (id, state) => states.push(state),
    metadata: () => {},
  });
  saver.enqueue(item(), "owner");
  const saving = saver.flush();
  await started.promise;
  saver.enqueue(item("latest edit"), "owner");
  gate.resolve();
  await saving;
  await saver.settled();
  assert.deepEqual(
    calls.map((x) => x.revision),
    [0, 1],
  );
  assert.equal(calls[1].x.outputs.caption, "latest edit");
  assert.equal(local.at(-1).outputs.caption, "latest edit");
  assert.equal(local.at(-1).revision, 2);
  assert.equal(local.at(-1).cloudSavedLocalUpdated, "latest edit");
  assert.equal(states.at(-1), "cloud-saved");
});
test("offline save keeps a backup and retries without silently losing edits", async () => {
  let offline = true,
    local;
  const states = [];
  const saver = new DraftAutosave({
    local: async (x) => (local = x),
    remote: async () => {
      if (offline) throw Error("offline");
      return { revision: 1 };
    },
    status: (id, state) => states.push(state),
    metadata: () => {},
  });
  await saver.enqueue(item(), "owner", { immediate: true });
  assert.equal(local.outputs.caption, "first");
  assert.equal(states.at(-1), "cloud-error");
  offline = false;
  await saver.retry();
  assert.equal(states.at(-1), "cloud-saved");
  assert.equal(local.revision, 1);
});
test("conflicting cloud content is never overwritten automatically", async () => {
  let calls = 0,
    local;
  const states = [];
  const saver = new DraftAutosave({
    local: async (x) => (local = x),
    remote: async () => {
      calls++;
      throw Object.assign(Error("Conflict"), { status: 409 });
    },
    status: (id, state) => states.push(state),
    metadata: () => {},
  });
  await saver.enqueue(
    { ...item(), cloudOwner: "owner", revision: 2 },
    "owner",
    { immediate: true },
  );
  assert.equal(calls, 1);
  assert.equal(states.at(-1), "conflict");
  assert.equal(local.outputs.caption, "first");
  assert.equal(local.revision, 2);
  assert.equal(saver.failed.size, 1);
});
test("incomplete and signed-out drafts remain saved locally", async () => {
  let calls = 0,
    local;
  const saver = new DraftAutosave({
    local: async (x) => (local = x),
    remote: async () => {
      calls++;
    },
    status: () => {},
    metadata: () => {},
  });
  await saver.enqueue(
    { ...item(), values: { make: "Toyota", model: "" } },
    "owner",
  );
  await saver.settled();
  assert.equal(local.values.make, "Toyota");
  assert.equal(calls, 0);
  await saver.enqueue(item());
  await saver.settled();
  assert.equal(local.outputs.caption, "first");
  assert.equal(calls, 0);
});
test("restored revision is used and a different account cannot receive the draft", async () => {
  const calls = [];
  const saver = new DraftAutosave({
    local: async () => {},
    remote: async (x, owner, revision) => {
      calls.push(revision);
      return { revision: revision + 1 };
    },
    status: () => {},
    metadata: () => {},
  });
  const restored = { ...item(), cloudOwner: "owner", revision: 7 };
  saver.restore(restored, "owner");
  await saver.enqueue(restored, "owner", { immediate: true });
  assert.deepEqual(calls, [7]);
  await saver.enqueue(restored, "other", { immediate: true });
  assert.deepEqual(calls, [7]);
});
test("failure of both storage paths is never labelled as saved", async () => {
  const states = [];
  const saver = new DraftAutosave({
    local: async () => {
      throw Error("Quota exceeded");
    },
    remote: async () => {
      throw Error("Offline");
    },
    status: (id, state) => states.push(state),
    metadata: () => {},
  });
  await saver.enqueue(item(), "owner", { immediate: true });
  assert.equal(states.at(-1), "save-error");
  assert.ok(!states.includes("cloud-saved"));
});
test("clearing required details during a write is retained locally without false cloud success", async () => {
  const gate = deferred(),
    started = deferred(),
    states = [];
  let local;
  const saver = new DraftAutosave({
    local: async (x) => (local = x),
    remote: async () => {
      started.resolve();
      await gate.promise;
      return { revision: 1 };
    },
    status: (id, state) => states.push(state),
    metadata: () => {},
  });
  saver.enqueue(item(), "owner");
  const running = saver.flush();
  await started.promise;
  saver.enqueue(
    { ...item("partial edit"), values: { make: "Toyota", model: "" } },
    "owner",
  );
  gate.resolve();
  await running;
  await saver.settled();
  assert.equal(local.values.model, "");
  assert.equal(states.at(-1), "needs-details");
});
