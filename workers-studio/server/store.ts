import { vehicles, vehicleSchema } from "./vehicles";
import {
  approvedMonthPlan,
  MONTH_PLAN_ID,
  MONTH_PLAN_LABEL,
} from "./month-plan";
import { schema } from "./schema";
import {
  categories,
  defaultSettings,
  platforms,
  templates,
  platformSchedule,
  type Post,
} from "../src/model";
import {
  HttpError,
  obj,
  text,
  url,
  date,
  validatePost,
  validateEntity,
  choice,
} from "./validation";
const tables = [
  "posts",
  "ideas",
  "campaigns",
  "templates",
  "plans",
  "inquiries",
  "analytics",
  "media",
];
const now = () => new Date().toISOString();
const id = () => crypto.randomUUID();
const CHUNK = 262144,
  FILE_LIMIT = 50 * 1024 * 1024,
  STORE_LIMIT = 500 * 1024 * 1024;
function unpack(r: any) {
  return {
    ...JSON.parse(String(r.data)),
    id: r.id,
    version: r.version,
    created_at: r.created_at,
    updated_at: r.updated_at,
    ...("size" in r ? { size: r.size, mime: r.mime } : {}),
  };
}
function bytes(v: any) {
  return v instanceof Uint8Array ? v : new Uint8Array(v);
}
export class StudioStore {
  sql: SqlStorage;
  constructor(private ctx: DurableObjectState) {
    this.sql = ctx.storage.sql;
    this.sql.exec(schema);
    this.sql.exec(vehicleSchema);
    const first = !this.one("SELECT id FROM settings WHERE id=1");
    this.sql.exec(
      "INSERT OR IGNORE INTO settings VALUES(1,?)",
      JSON.stringify(defaultSettings),
    );
    for (const c of categories)
      this.sql.exec(
        "INSERT OR IGNORE INTO content_categories VALUES(?,?)",
        c,
        c,
      );
    if (first)
      for (const t of templates)
        this.sql.exec(
          "INSERT OR IGNORE INTO templates VALUES(?,?,1,?,?)",
          "builtin-" + t.id,
          JSON.stringify({ ...t, caption_ur: "" }),
          now(),
          now(),
        );
  }
  rows(q: string, ...b: any[]) {
    return this.sql.exec(q, ...b).toArray() as any[];
  }
  one(q: string, ...b: any[]) {
    return this.rows(q, ...b)[0];
  }
  get(table: string, key: string) {
    if (!tables.includes(table)) throw new HttpError(404, "Record not found.");
    const r = this.one(`SELECT * FROM ${table} WHERE id=?`, key);
    if (!r) throw new HttpError(404, "Record not found.");
    return unpack(r);
  }
  settings() {
    return JSON.parse(this.one("SELECT data FROM settings WHERE id=1").data);
  }
  notification(
    postId: string | null,
    title: string,
    body: string,
    kind: string,
    dedupe: string,
  ) {
    this.sql.exec(
      "INSERT OR IGNORE INTO notifications(id,post_id,title,body,kind,created_at,dedupe) VALUES(?,?,?,?,?,?,?)",
      id(),
      postId,
      title,
      body,
      kind,
      now(),
      dedupe,
    );
  }
  history(
    postId: string,
    platform: string,
    action: string,
    message: string,
    externalURL = "",
    jobId: string | null = null,
  ) {
    this.sql.exec(
      "INSERT INTO publishing_history VALUES(?,?,?,?,?,?,?,?)",
      id(),
      postId,
      platform,
      action,
      message,
      externalURL,
      now(),
      jobId,
    );
  }
  checkVersion(record: any, b: any) {
    if (!Number.isInteger(b.version) || record.version !== b.version)
      throw new HttpError(
        409,
        "This record changed on another device. Refresh before editing.",
      );
  }
  async nextAlarm() {
    const jobs = this.rows(
      "SELECT due_at,remind_at,upcoming_sent,due_sent FROM publishing_jobs WHERE status='queued'",
    );
    let next = Infinity;
    for (const j of jobs) {
      if (!j.upcoming_sent) next = Math.min(next, Date.parse(j.remind_at));
      if (!j.due_sent) next = Math.min(next, Date.parse(j.due_at));
    }
    if (Number.isFinite(next))
      await this.ctx.storage.setAlarm(Math.max(Date.now() + 1000, next));
    else await this.ctx.storage.deleteAlarm();
  }
  async alarm() {
    await this.runScheduler();
  }
  async runScheduler() {
    const settings = this.settings(),
      time = now();
    this.ctx.storage.transactionSync(() => {
      for (const j of this.rows(
        "SELECT * FROM publishing_jobs WHERE status='queued' AND (remind_at<=? OR due_at<=?)",
        time,
        time,
      )) {
        const post = this.get("posts", j.post_id);
        if (!["Scheduled", "Publishing", "Failed"].includes(post.status)) {
          this.sql.exec(
            "UPDATE publishing_jobs SET status='cancelled' WHERE id=?",
            j.id,
          );
          continue;
        }
        if (j.due_at <= time && !j.due_sent) {
          if (settings.reminders)
            this.notification(
              post.id,
              post.planner_only ? "Time to post" : "Manual publication is due",
              post.planner_only
                ? `${post.title} · ${j.platform}. Post manually, then mark it posted in your planner.`
                : `${post.title} · ${j.platform}. Open the publishing desk to copy the caption and download media.`,
              "manual_due",
              "due:" + j.id,
            );
          this.sql.exec(
            "UPDATE publishing_jobs SET due_sent=1,upcoming_sent=1 WHERE id=?",
            j.id,
          );
        } else if (j.remind_at <= time && !j.upcoming_sent) {
          if (settings.reminders)
            this.notification(
              post.id,
              post.planner_only
                ? "Posting reminder"
                : "Publication approaching",
              `${post.title} · ${j.platform}. Prepare your manual post.`,
              "upcoming",
              "upcoming:" + j.id,
            );
          this.sql.exec(
            "UPDATE publishing_jobs SET upcoming_sent=1 WHERE id=?",
            j.id,
          );
        }
      }
    });
    await this.nextAlarm();
    return { ok: true };
  }
  validateReferences(data: any) {
    for (const media of new Set<string>([
      ...(data.media_ids ?? []),
      ...Object.values(data.variants ?? {}).flatMap(
        (v: any) => v.media_ids ?? [],
      ),
    ])) {
      const m = this.get("media", media);
      if (!this.one("SELECT ready FROM media WHERE id=?", media)?.ready)
        throw new HttpError(400, "An attached file is not ready.");
      if (
        !data.planner_only &&
        ["Approved", "Scheduled", "Publishing"].includes(data.status) &&
        !m.rights_confirmed
      )
        throw new HttpError(
          400,
          "Confirm usage rights for each attached media file first.",
        );
    }
    if (data.campaign_id) this.get("campaigns", data.campaign_id);
    if (data.post_id) this.get("posts", data.post_id);
  }
  schedule(post: any) {
    const previous = this.rows(
        "SELECT * FROM publishing_jobs WHERE post_id=? AND status IN ('queued','failed')",
        post.id,
      ),
      keep = new Set<string>();
    if (post.status === "Scheduled")
      for (const platform of post.platforms) {
        const due = platformSchedule(post, platform),
          existing = previous.find(
            (j) =>
              j.platform === platform &&
              j.due_at === due &&
              j.status === "queued",
          );
        if (existing) {
          keep.add(existing.id);
          continue;
        }
        const key = id();
        keep.add(key);
        this.sql.exec(
          "INSERT INTO publishing_jobs(id,post_id,platform,generation,due_at,remind_at,status) VALUES(?,?,?,?,?,?,?)",
          key,
          post.id,
          platform,
          post.version,
          due,
          new Date(
            Date.parse(due) - this.settings().lead_minutes * 60000,
          ).toISOString(),
          "queued",
        );
      }
    for (const j of previous)
      if (!keep.has(j.id)) {
        this.sql.exec(
          "UPDATE publishing_jobs SET status='cancelled' WHERE id=?",
          j.id,
        );
        this.sql.exec(
          "DELETE FROM notifications WHERE dedupe IN (?,?)",
          "due:" + j.id,
          "upcoming:" + j.id,
        );
      }
  }

  savePost(data: any, key?: string, allowPast = false) {
    const previous = key ? this.get("posts", key) : null;
    if (previous) this.checkVersion(previous, data);
    if (
      ["Publishing", "Published", "Failed"].includes(data.status) &&
      data.status !== previous?.status
    )
      throw new HttpError(
        400,
        "Use the publishing desk to confirm publication or record a failure.",
      );
    if (
      previous?.status === "Published" &&
      data.status !== "Archived" &&
      data.status !== "Published"
    )
      throw new HttpError(400, "Duplicate a published post to reuse it.");
    if (
      previous &&
      this.one(
        "SELECT id FROM publishing_jobs WHERE post_id=? AND status='confirmed'",
        previous.id,
      ) &&
      data.status !== "Archived"
    )
      throw new HttpError(
        409,
        "A platform is already published. Use the publishing desk for remaining platforms, or duplicate this post.",
      );
    const clean = validatePost(data);
    this.validateReferences(clean);
    if (
      clean.status === "Scheduled" &&
      !allowPast &&
      clean.platforms.some(
        (p: string) =>
          Date.parse(platformSchedule(clean, p)) <= Date.now() &&
          (!previous ||
            platformSchedule(clean, p) !== platformSchedule(previous, p)),
      )
    )
      throw new HttpError(
        400,
        "Choose a future time for each scheduled platform.",
      );
    const stamp = now(),
      record = {
        ...clean,
        id: key ?? id(),
        version: (previous?.version ?? 0) + 1,
        created_at: previous?.created_at ?? stamp,
        updated_at: stamp,
      };
    this.sql.exec(
      "INSERT INTO posts VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,status=excluded.status,scheduled_at=excluded.scheduled_at,category=excluded.category,version=excluded.version,updated_at=excluded.updated_at",
      record.id,
      JSON.stringify(clean),
      clean.status,
      clean.scheduled_at,
      clean.category,
      record.version,
      record.created_at,
      stamp,
    );
    this.sql.exec("DELETE FROM platform_versions WHERE post_id=?", record.id);
    for (const p of clean.platforms)
      this.sql.exec(
        "INSERT INTO platform_versions VALUES(?,?,?)",
        record.id,
        p,
        JSON.stringify(clean.variants[p] ?? {}),
      );
    // Editing an unchanged published/failed record must not remove its publication history.
    if (
      !previous ||
      clean.status !== previous.status ||
      [
        "Scheduled",
        "Draft",
        "Editing",
        "Approved",
        "Ready for Review",
        "Archived",
      ].includes(clean.status)
    )
      this.schedule(record);
    if (
      clean.status === "Ready for Review" &&
      previous?.status !== "Ready for Review" &&
      this.settings().review_alerts
    )
      this.notification(
        record.id,
        "Content needs review",
        record.title,
        "review",
        "review:" + record.id + ":" + record.version,
      );
    this.history(record.id, "All", "Saved", `Status: ${record.status}`);
    return record;
  }
  async upload(r: Request) {
    const expected = Number(r.headers.get("X-File-Size")),
      mime = r.headers.get("Content-Type")?.split(";")[0] ?? "",
      name = text(
        decodeURIComponent(r.headers.get("X-File-Name") ?? ""),
        "Filename",
        200,
        true,
      );
    const allowed = [
      "image/jpeg",
      "image/png",
      "image/webp",
      "image/gif",
      "video/mp4",
      "video/quicktime",
      "video/webm",
    ];
    if (!allowed.includes(mime))
      throw new HttpError(415, "Use JPG, PNG, WebP, GIF, MP4, MOV or WebM.");
    if (
      !Number.isSafeInteger(expected) ||
      expected < 16 ||
      expected > FILE_LIMIT
    )
      throw new HttpError(413, "Each file must be between 16 bytes and 50 MB.");
    const used = Number(
      this.one("SELECT COALESCE(SUM(size),0) AS size FROM media").size,
    );
    if (used + expected > STORE_LIMIT)
      throw new HttpError(
        413,
        "The 500 MB media allowance is full. Remove unused files before uploading.",
      );
    const key = id(),
      stamp = now();
    const metadata = validateEntity("media", {
      title: name,
      status: "Available",
    });
    const reader = r.body?.getReader();
    if (!reader) throw new HttpError(400, "No file was supplied.");
    this.sql.exec(
      "INSERT INTO media VALUES(?,?,?,?,0,1,?,?)",
      key,
      JSON.stringify(metadata),
      expected,
      mime,
      stamp,
      stamp,
    );
    let total = 0,
      part = 0,
      pending = new Uint8Array(0),
      checked = false;
    try {
      while (true) {
        const x = await reader.read();
        if (x.done) break;
        total += x.value.length;
        if (total > expected || total > FILE_LIMIT)
          throw new HttpError(413, "File size exceeded its declared limit.");
        const joined = new Uint8Array(pending.length + x.value.length);
        joined.set(pending);
        joined.set(x.value, pending.length);
        pending = joined;
        if (!checked && pending.length >= 16) {
          const b = pending,
            ascii = (start: number, n: number) =>
              new TextDecoder().decode(b.slice(start, start + n));
          const valid =
            mime === "image/jpeg"
              ? b[0] === 255 && b[1] === 216 && b[2] === 255
              : mime === "image/png"
                ? b[0] === 137 && ascii(1, 3) === "PNG"
                : mime === "image/gif"
                  ? ascii(0, 3) === "GIF"
                  : mime === "image/webp"
                    ? ascii(0, 4) === "RIFF" && ascii(8, 4) === "WEBP"
                    : mime === "video/webm"
                      ? b[0] === 26 &&
                        b[1] === 69 &&
                        b[2] === 223 &&
                        b[3] === 163
                      : ascii(4, 4) === "ftyp";
          if (!valid)
            throw new HttpError(
              415,
              "The file contents do not match its supported format.",
            );
          checked = true;
        }
        while (pending.length >= CHUNK) {
          this.sql.exec(
            "INSERT INTO media_chunks VALUES(?,?,?)",
            key,
            part++,
            pending.slice(0, CHUNK).buffer,
          );
          pending = pending.slice(CHUNK);
        }
      }
      if (total !== expected || !checked)
        throw new HttpError(400, "Upload was incomplete. Please retry.");
      if (pending.length)
        this.sql.exec(
          "INSERT INTO media_chunks VALUES(?,?,?)",
          key,
          part,
          pending.buffer,
        );
      this.sql.exec("UPDATE media SET ready=1 WHERE id=?", key);
      return this.get("media", key);
    } catch (e) {
      await reader.cancel().catch(() => {});
      this.sql.exec("DELETE FROM media WHERE id=?", key);
      throw e;
    }
  }
  mediaResponse(key: string, r: Request) {
    const m = this.get("media", key);
    if (!this.one("SELECT ready FROM media WHERE id=?", key)?.ready)
      throw new HttpError(404, "File is not ready.");
    const range = r.headers.get("Range");
    let start = 0,
      end = m.size - 1,
      status = 200;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (!match || (!match[1] && !match[2]))
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${m.size}` },
        });
      if (!match[1]) start = Math.max(0, m.size - Number(match[2]));
      else {
        start = Number(match[1]);
        if (match[2]) end = Math.min(end, Number(match[2]));
      }
      if (start > end || start >= m.size)
        return new Response(null, {
          status: 416,
          headers: { "Content-Range": `bytes */${m.size}` },
        });
      status = 206;
    }
    let index = Math.floor(start / CHUNK);
    const store = this;
    const stream = new ReadableStream({
      pull(controller) {
        try {
          const row = store.one(
            "SELECT bytes FROM media_chunks WHERE media_id=? AND part=?",
            key,
            index,
          );
          if (!row) {
            controller.error(new Error("File chunk missing."));
            return;
          }
          const chunk = bytes(row.bytes),
            offset = index * CHUNK;
          controller.enqueue(
            chunk.slice(
              Math.max(0, start - offset),
              Math.min(chunk.length, end - offset + 1),
            ),
          );
          index++;
          if (index * CHUNK > end) controller.close();
        } catch (e) {
          controller.error(e);
        }
      },
    });
    const h: Record<string, string> = {
      "Content-Type": m.mime,
      "Content-Length": String(end - start + 1),
      "Accept-Ranges": "bytes",
      "Cache-Control": "no-store, private",
      "Content-Disposition": `${new URL(r.url).searchParams.has("download") ? "attachment" : "inline"}; filename="media-${key}.${m.mime.split("/")[1] === "quicktime" ? "mov" : m.mime.split("/")[1]}"`,
    };
    if (status === 206) h["Content-Range"] = `bytes ${start}-${end}/${m.size}`;
    return new Response(stream, { status, headers: h });
  }
  applyApprovedMonthPlan(atTime = Date.now()) {
    return this.ctx.storage.transactionSync(() => {
      const applied = this.one(
        "SELECT * FROM planner_batches WHERE id=?",
        MONTH_PLAN_ID,
      );
      if (applied)
        return {
          batch_id: MONTH_PLAN_ID,
          label: MONTH_PLAN_LABEL,
          already_applied: true,
          added: 0,
          tasks_added: 0,
          applied_at: applied.applied_at,
          conflicts: 0,
        };
      const existing = new Set(
        this.rows(
          "SELECT platform,due_at FROM publishing_jobs WHERE status='queued'",
        ).map((j) => j.platform + "|" + j.due_at),
      );
      const posts = approvedMonthPlan();
      let conflicts = 0,
        tasks = 0;
      const ids: string[] = [];
      for (const post of posts) {
        for (const platform of post.platforms) {
          tasks++;
          if (existing.has(platform + "|" + platformSchedule(post, platform)))
            conflicts++;
        }
        const saved = this.savePost(post, undefined, true);
        ids.push(saved.id);
        // Old tasks stay visible as overdue, but importing them must not send stale alerts.
        this.sql.exec(
          "UPDATE publishing_jobs SET upcoming_sent=1,due_sent=1 WHERE post_id=? AND due_at<=?",
          saved.id,
          new Date(atTime).toISOString(),
        );
      }
      const appliedAt = now();
      this.sql.exec(
        "INSERT INTO planner_batches VALUES(?,?,?,?)",
        MONTH_PLAN_ID,
        appliedAt,
        JSON.stringify(ids),
        tasks,
      );
      return {
        batch_id: MONTH_PLAN_ID,
        label: MONTH_PLAN_LABEL,
        already_applied: false,
        added: ids.length,
        tasks_added: tasks,
        applied_at: appliedAt,
        conflicts,
      };
    });
  }
  async fetch(r: Request) {
    try {
      const u = new URL(r.url),
        path = u.pathname.split("/").filter(Boolean);
      if (path[0] === "vehicle-library" && r.method === "GET")
        return Response.json({
          media: this.rows(
            "SELECT id,data FROM media WHERE ready=1 AND mime IN (?,?,?) ORDER BY created_at DESC LIMIT 500",
            "image/jpeg",
            "image/png",
            "image/webp",
          ).map((row) => ({ ...JSON.parse(row.data), id: row.id })),
        });
      if (path[0] === "vehicle-listings") return await vehicles(this, r, path);
      if (path[0] === "limit") {
        const b: any = await r.json(),
          time = Date.now(),
          old = this.one("SELECT * FROM login_limits WHERE key=?", b.key);
        const count =
          old && time - Number(old.start) < 600000 ? Number(old.count) + 1 : 1;
        this.sql.exec(
          "INSERT INTO login_limits VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET start=excluded.start,count=excluded.count",
          b.key,
          old && time - Number(old.start) < 600000 ? old.start : time,
          count,
        );
        this.sql.exec("DELETE FROM login_limits WHERE start<?", time - 3600000);
        return Response.json(
          { allowed: count <= 10 },
          { status: count <= 10 ? 200 : 429 },
        );
      }
      if (path[0] === "redirect") {
        const link = this.one(
          "SELECT * FROM tracked_links WHERE id=?",
          path[1],
        );
        if (!link) return new Response("Link not found", { status: 404 });
        this.sql.exec(
          "UPDATE tracked_links SET clicks=clicks+1 WHERE id=?",
          path[1],
        );
        return new Response(null, {
          status: 302,
          headers: { Location: link.target, "Cache-Control": "no-store" },
        });
      }
      if (path[0] === "media" && path[1] === "upload" && r.method === "POST")
        return Response.json(await this.upload(r), { status: 201 });
      if (path[0] === "media" && path[2] === "file" && r.method === "GET")
        return this.mediaResponse(path[1], r);
      if (r.method === "GET" && path[0] === "state") {
        this.sql.exec(
          "DELETE FROM media WHERE ready=0 AND created_at<?",
          new Date(Date.now() - 3600000).toISOString(),
        );
        await this.runScheduler();
        const result: any = {};
        for (const table of tables)
          result[table] = this.rows(
            `SELECT * FROM ${table}${table === "media" ? " WHERE ready=1" : ""} ORDER BY created_at DESC`,
          ).map(unpack);
        result.jobs = this.rows(
          "SELECT * FROM publishing_jobs ORDER BY due_at DESC LIMIT 1000",
        );
        result.history = this.rows(
          "SELECT * FROM publishing_history ORDER BY created_at DESC LIMIT 1000",
        );
        result.notifications = this.rows(
          "SELECT * FROM notifications ORDER BY created_at DESC LIMIT 300",
        );
        result.links = this.rows(
          "SELECT * FROM tracked_links ORDER BY created_at DESC",
        );
        result.settings = this.settings();
        result.server_time = now();
        result.storage = {
          used: Number(
            this.one("SELECT COALESCE(SUM(size),0) AS size FROM media").size,
          ),
          limit: STORE_LIMIT,
          file_limit: FILE_LIMIT,
        };
        return Response.json(result);
      }
      if (r.method === "GET" && path[0] === "export") {
        const out: any = {
          exported_at: now(),
          application: "Dream Motors Social Media Studio",
          version: 1,
        };
        for (const table of tables)
          out[table] = this.rows(`SELECT * FROM ${table}`).map(unpack);
        out.publishing_jobs = this.rows("SELECT * FROM publishing_jobs");
        out.history = this.rows("SELECT * FROM publishing_history");
        out.notifications = this.rows("SELECT * FROM notifications");
        out.links = this.rows("SELECT * FROM tracked_links");
        out.settings = this.settings();
        out.vehicle_listings = this.rows("SELECT * FROM vehicle_listings").map(
          (row: any) => ({
            ...JSON.parse(row.data),
            id: row.id,
            revision: row.revision,
            updated: row.updated,
            post_id: row.post_id,
            photos: this.rows(
              "SELECT name,data FROM vehicle_photos WHERE listing_id=? ORDER BY position",
              row.id,
            ),
          }),
        );
        out.planner_batches = this.rows("SELECT * FROM planner_batches");
        return Response.json(out, {
          headers: {
            "Content-Disposition":
              'attachment; filename="dream-motors-studio-backup.json"',
          },
        });
      }
      const b = r.method === "GET" ? {} : obj(await r.json());
      let result: any;
      if (
        path[0] === "planner" &&
        path[1] === "month-plan" &&
        r.method === "POST"
      ) {
        result = this.applyApprovedMonthPlan();
        await this.nextAlarm();
      } else if (path[0] === "scheduler" && r.method === "POST") {
        result = await this.runScheduler();
      } else if (path[0] === "settings" && r.method === "PUT") {
        const lead = Number(b.lead_minutes);
        if (![0, 5, 15, 30, 60].includes(lead))
          throw new HttpError(400, "Choose a supported reminder time.");
        const data = {
          reminders: b.reminders === true,
          review_alerts: b.review_alerts === true,
          lead_minutes: lead,
          business_url: url(b.business_url, "Business URL"),
          timezone: "Asia/Karachi",
        };
        this.sql.exec(
          "UPDATE settings SET data=? WHERE id=1",
          JSON.stringify(data),
        );
        for (const j of this.rows(
          "SELECT id,due_at FROM publishing_jobs WHERE status='queued'",
        ))
          this.sql.exec(
            "UPDATE publishing_jobs SET remind_at=? WHERE id=?",
            new Date(Date.parse(j.due_at) - lead * 60000).toISOString(),
            j.id,
          );
        await this.nextAlarm();
        result = data;
      } else if (path[0] === "notifications" && r.method === "PUT") {
        if (path[1] === "all")
          this.sql.exec("UPDATE notifications SET is_read=1");
        else
          this.sql.exec(
            "UPDATE notifications SET is_read=1 WHERE id=?",
            path[1],
          );
        result = { ok: true };
      } else if (
        path[0] === "posts" &&
        path[2] === "reschedule" &&
        r.method === "POST"
      ) {
        result = this.ctx.storage.transactionSync(() => {
          const post = this.get("posts", path[1]);
          this.checkVersion(post, b);
          if (!["Scheduled", "Publishing", "Failed"].includes(post.status))
            throw new HttpError(
              400,
              "Schedule approved content in the editor first.",
            );
          const platform = choice(b.platform, post.platforms, "platform");
          if (
            this.one(
              "SELECT id FROM publishing_jobs WHERE post_id=? AND platform=? AND status='confirmed'",
              post.id,
              platform,
            )
          )
            throw new HttpError(
              409,
              "This platform is already published. Duplicate the post to publish it again.",
            );
          const due = date(b.scheduled_at, true);
          if (Date.parse(due) <= Date.now())
            throw new HttpError(400, "Choose a future publication time.");
          if (
            platformSchedule(post, platform) === due &&
            this.one(
              "SELECT id FROM publishing_jobs WHERE post_id=? AND platform=? AND due_at=? AND status='queued'",
              post.id,
              platform,
              due,
            )
          )
            return post;
          for (const job of this.rows(
            "SELECT id FROM publishing_jobs WHERE post_id=? AND platform=? AND status IN ('queued','failed')",
            post.id,
            platform,
          )) {
            this.sql.exec(
              "UPDATE publishing_jobs SET status='cancelled' WHERE id=?",
              job.id,
            );
            this.sql.exec(
              "DELETE FROM notifications WHERE dedupe IN (?,?)",
              "due:" + job.id,
              "upcoming:" + job.id,
            );
          }
          const hasConfirmed = this.one(
            "SELECT id FROM publishing_jobs WHERE post_id=? AND status='confirmed'",
            post.id,
          );
          const hasFailure = this.one(
            "SELECT id FROM publishing_jobs WHERE post_id=? AND status='failed'",
            post.id,
          );
          const status = hasFailure
            ? "Failed"
            : hasConfirmed
              ? "Publishing"
              : "Scheduled";
          const version = post.version + 1;
          const next = {
            ...post,
            status,
            variants: {
              ...post.variants,
              [platform]: {
                ...(post.variants[platform] ?? {
                  caption: "",
                  hashtags: "",
                  media_ids: [],
                }),
                scheduled_at: due,
              },
            },
          };
          this.sql.exec(
            "UPDATE posts SET data=?,status=?,version=?,updated_at=? WHERE id=?",
            JSON.stringify(next),
            status,
            version,
            now(),
            post.id,
          );
          this.sql.exec(
            "INSERT INTO publishing_jobs(id,post_id,platform,generation,due_at,remind_at,status) VALUES(?,?,?,?,?,?,?)",
            id(),
            post.id,
            platform,
            version,
            due,
            new Date(
              Date.parse(due) - this.settings().lead_minutes * 60000,
            ).toISOString(),
            "queued",
          );
          this.history(
            post.id,
            platform,
            "Rescheduled",
            "Manual publication rescheduled to " + due,
          );
          return this.get("posts", post.id);
        });
        await this.nextAlarm();
      } else if (
        path[0] === "posts" &&
        path[2] === "duplicate" &&
        r.method === "POST"
      ) {
        result = this.ctx.storage.transactionSync(() => {
          const p = this.get("posts", path[1]);
          return this.savePost({
            ...p,
            title: p.title + " (copy)",
            status: "Draft",
            scheduled_at: "",
            variants: Object.fromEntries(
              Object.entries(p.variants ?? {}).map(([k, v]: any) => [
                k,
                { ...v, scheduled_at: "" },
              ]),
            ),
          });
        });
        await this.nextAlarm();
      } else if (
        path[0] === "posts" &&
        path[2] === "publish" &&
        r.method === "POST"
      ) {
        result = this.ctx.storage.transactionSync(() => {
          const post = this.get("posts", path[1]);
          this.checkVersion(post, b);
          const platform = choice(b.platform, post.platforms, "platform"),
            action = choice(
              b.action,
              ["confirmed", "failed"],
              "publication action",
            );
          if (
            [
              "Archived",
              "Idea",
              "Draft",
              "Editing",
              "Ready for Review",
            ].includes(post.status)
          )
            throw new HttpError(
              400,
              "Approve the content before publishing it.",
            );
          validatePost({ ...post, status: "Approved" });
          const done = this.one(
            "SELECT id FROM publishing_jobs WHERE post_id=? AND platform=? AND status='confirmed'",
            post.id,
            platform,
          );
          if (done)
            throw new HttpError(
              409,
              "This platform was already confirmed. Duplicate the post to publish it again.",
            );
          let job = this.one(
            "SELECT * FROM publishing_jobs WHERE post_id=? AND platform=? AND status IN ('queued','failed') ORDER BY generation DESC LIMIT 1",
            post.id,
            platform,
          );
          if (!job) {
            job = { id: id() };
            this.sql.exec(
              "INSERT INTO publishing_jobs(id,post_id,platform,generation,due_at,remind_at,status) VALUES(?,?,?,?,?,?,?)",
              job.id,
              post.id,
              platform,
              post.version + 1,
              now(),
              now(),
              "queued",
            );
          }
          const externalURL = url(b.external_url, "Live post URL"),
            message = text(
              b.message,
              "Publication note",
              1000,
              action === "failed",
            );
          this.sql.exec(
            "UPDATE publishing_jobs SET status=?,upcoming_sent=1,due_sent=1 WHERE id=?",
            action,
            job.id,
          );
          if (action === "failed") {
            this.history(
              post.id,
              platform,
              "Manual failure",
              message,
              externalURL,
            );
            this.notification(
              post.id,
              "Publication failed",
              `${platform}: ${message}`,
              "failure",
              "failure:" + job.id + ":" + id(),
            );
          } else
            this.history(
              post.id,
              platform,
              "Manually confirmed",
              message || "Owner confirmed publication on the platform.",
              externalURL,
              job.id,
            );
          const confirmed = new Set(
            this.rows(
              "SELECT platform FROM publishing_jobs WHERE post_id=? AND status='confirmed'",
              post.id,
            ).map((j) => j.platform),
          );
          const newStatus = post.platforms.every((p: string) =>
            confirmed.has(p),
          )
            ? "Published"
            : this.one(
                  "SELECT id FROM publishing_jobs WHERE post_id=? AND status='failed'",
                  post.id,
                )
              ? "Failed"
              : "Publishing";
          const next = { ...post, status: newStatus };
          this.sql.exec(
            "UPDATE posts SET data=?,status=?,version=version+1,updated_at=? WHERE id=?",
            JSON.stringify(next),
            newStatus,
            now(),
            post.id,
          );
          this.sql.exec(
            "UPDATE notifications SET is_read=1 WHERE post_id=? AND kind IN ('manual_due','upcoming')",
            post.id,
          );
          return this.get("posts", post.id);
        });
        await this.nextAlarm();
      } else if (path[0] === "bulk-schedule" && r.method === "POST") {
        if (!Array.isArray(b.posts) || !b.posts.length || b.posts.length > 30)
          throw new HttpError(400, "Select between 1 and 30 approved posts.");
        const interval = Number(b.interval_minutes);
        if (!Number.isInteger(interval) || interval < 1 || interval > 10080)
          throw new HttpError(400, "Choose a valid spacing in minutes.");
        const start = Date.parse(date(b.start_at, true));
        result = this.ctx.storage.transactionSync(() =>
          b.posts.map((item: any, i: number) => {
            const p = this.get("posts", text(item.id, "Post", 100, true));
            this.checkVersion(p, item);
            if (p.status !== "Approved")
              throw new HttpError(
                400,
                "Bulk scheduling accepts approved posts only.",
              );
            return this.savePost(
              {
                ...p,
                status: "Scheduled",
                scheduled_at: new Date(
                  start + i * interval * 60000,
                ).toISOString(),
                variants: Object.fromEntries(
                  Object.entries(p.variants ?? {}).map(([k, v]: any) => [
                    k,
                    { ...v, scheduled_at: "" },
                  ]),
                ),
              },
              p.id,
            );
          }),
        );
        await this.nextAlarm();
      } else if (
        path[0] === "ideas" &&
        path[2] === "convert" &&
        r.method === "POST"
      ) {
        result = this.ctx.storage.transactionSync(() => {
          const idea = this.get("ideas", path[1]);
          this.checkVersion(idea, b);
          if (idea.converted_post_id)
            return this.get("posts", idea.converted_post_id);
          const post = this.savePost({
            title: idea.title,
            category: idea.category,
            content_type: "Educational post",
            platforms: ["Facebook"],
            caption_en: "",
            caption_ur: "",
            hashtags: "",
            media_ids: [],
            scheduled_at: "",
            notes: idea.notes,
            status: "Draft",
            sources: idea.source_url ? [idea.source_url] : [],
            rights_confirmed: false,
            campaign_id: "",
            inventory_url: "",
            variants: {},
          });
          this.sql.exec(
            "UPDATE ideas SET data=?,version=version+1,updated_at=? WHERE id=?",
            JSON.stringify({ ...idea, converted_post_id: post.id }),
            now(),
            idea.id,
          );
          return post;
        });
      } else if (path[0] === "links" && r.method === "POST") {
        if (b.post_id) this.get("posts", b.post_id);
        if (b.campaign_id) this.get("campaigns", b.campaign_id);
        const key = id().replaceAll("-", "").slice(0, 16);
        this.sql.exec(
          "INSERT INTO tracked_links VALUES(?,?,?,?,0,?)",
          key,
          text(b.post_id, "Post", 100),
          text(b.campaign_id, "Campaign", 100),
          url(b.target, "Destination URL", true),
          now(),
        );
        result = this.one("SELECT * FROM tracked_links WHERE id=?", key);
      } else if (path[0] === "links" && path[1] && r.method === "DELETE") {
        this.sql.exec("DELETE FROM tracked_links WHERE id=?", path[1]);
        result = { ok: true };
      } else if (tables.includes(path[0])) {
        const table = path[0],
          key = path[1];
        if (r.method === "DELETE" && key) {
          const old = this.get(table, key);
          this.checkVersion(old, b);
          if (table === "media") {
            for (const p of this.rows("SELECT * FROM posts").map(unpack))
              if (
                [
                  ...(p.media_ids ?? []),
                  ...Object.values(p.variants ?? {}).flatMap(
                    (v: any) => v.media_ids ?? [],
                  ),
                ].includes(key)
              )
                throw new HttpError(
                  409,
                  "This file is attached to a post. Remove it from the post before deleting.",
                );
          }
          if (table === "campaigns") {
            for (const t of ["posts", "media", "inquiries"])
              if (
                this.rows(`SELECT * FROM ${t}`).some(
                  (r) => JSON.parse(r.data).campaign_id === key,
                )
              )
                throw new HttpError(
                  409,
                  "This campaign is linked to records. Remove those links first.",
                );
          }
          this.sql.exec(`DELETE FROM ${table} WHERE id=?`, key);
          await this.nextAlarm();
          result = { ok: true };
        } else if (
          ["POST", "PUT"].includes(r.method) &&
          ((r.method === "POST" && !key) || (r.method === "PUT" && key))
        ) {
          result = this.ctx.storage.transactionSync(() => {
            if (table === "posts") return this.savePost(b, key);
            if (table === "media" && r.method === "POST")
              throw new HttpError(400, "Use the file uploader.");
            const previous = key ? this.get(table, key) : null;
            if (previous) this.checkVersion(previous, b);
            const clean = validateEntity(table, b);
            this.validateReferences(clean);
            const stamp = now(),
              key2 = key ?? id(),
              version = (previous?.version ?? 0) + 1;
            if (table === "media")
              this.sql.exec(
                "UPDATE media SET data=?,version=?,updated_at=? WHERE id=?",
                JSON.stringify(clean),
                version,
                stamp,
                key2,
              );
            else
              this.sql.exec(
                `INSERT INTO ${table} VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at`,
                key2,
                JSON.stringify(clean),
                version,
                previous?.created_at ?? stamp,
                stamp,
              );
            return this.get(table, key2);
          });
          await this.nextAlarm();
        } else throw new HttpError(405, "Method not allowed.");
      } else throw new HttpError(404, "Endpoint not found.");
      return Response.json(result, { status: r.method === "POST" ? 201 : 200 });
    } catch (e) {
      return Response.json(
        {
          error:
            e instanceof HttpError
              ? e.message
              : "Unable to save changes. Please retry.",
        },
        { status: e instanceof HttpError ? e.status : 500 },
      );
    }
  }
}
