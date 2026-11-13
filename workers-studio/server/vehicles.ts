import { sanitizeListing } from "../../server/worker.js";
import { emptyPost } from "../src/model";
import { HttpError } from "./validation";
export const vehicleSchema = `
CREATE TABLE IF NOT EXISTS vehicle_listings(id TEXT PRIMARY KEY,data TEXT NOT NULL,revision INTEGER NOT NULL,updated TEXT NOT NULL,post_id TEXT);
CREATE TABLE IF NOT EXISTS vehicle_photos(listing_id TEXT NOT NULL REFERENCES vehicle_listings(id) ON DELETE CASCADE,position INTEGER NOT NULL,name TEXT NOT NULL,data TEXT NOT NULL,media_id TEXT REFERENCES media(id) ON DELETE SET NULL,PRIMARY KEY(listing_id,position));
CREATE TABLE IF NOT EXISTS vehicle_media(hash TEXT PRIMARY KEY,media_id TEXT REFERENCES media(id) ON DELETE SET NULL);
`;
const parse = (row: any, photos: any[] = []) => ({
  ...JSON.parse(row.data),
  id: row.id,
  revision: row.revision,
  updated: row.updated,
  postId: row.post_id,
  photos,
  photoCount: row.photo_count ?? photos.length,
});
export async function vehicles(store: any, r: Request, path: string[]) {
  const key = path[1];
  if (r.method === "GET" && !key)
    return Response.json({
      listings: store
        .rows(
          "SELECT v.*, (SELECT COUNT(*) FROM vehicle_photos p WHERE p.listing_id=v.id) AS photo_count FROM vehicle_listings v ORDER BY updated DESC LIMIT 500",
        )
        .map((row: any) => parse(row)),
    });
  if (!key || !/^[a-zA-Z0-9-]{1,64}$/.test(key))
    throw new HttpError(400, "Invalid listing ID.");
  const old = store.one("SELECT * FROM vehicle_listings WHERE id=?", key);
  if (r.method === "GET" && path[2] === "photo") {
    if (!old) throw new HttpError(404, "Listing not found.");
    const photo = store.one(
      "SELECT data FROM vehicle_photos WHERE listing_id=? ORDER BY position LIMIT 1",
      key,
    );
    if (!photo) throw new HttpError(404, "No reference photo attached.");
    const [header, data] = photo.data.split(",");
    return new Response(
      Uint8Array.from(atob(data), (c) => c.charCodeAt(0)),
      {
        headers: {
          "Content-Type": header.slice(5).split(";")[0],
          "Cache-Control": "no-store, private",
        },
      },
    );
  }
  if (r.method === "GET") {
    if (!old) throw new HttpError(404, "Listing not found.");
    return Response.json(
      parse(
        old,
        store.rows(
          "SELECT name,data,media_id AS mediaId FROM vehicle_photos WHERE listing_id=? ORDER BY position",
          key,
        ),
      ),
    );
  }
  if (r.method === "PUT") {
    const input: any = await r.json();
    let clean: any;
    try {
      clean = sanitizeListing(input);
    } catch (e: any) {
      throw new HttpError(e.status || 400, e.message);
    }
    const result = store.ctx.storage.transactionSync(() => {
      const existing = store.one(
        "SELECT * FROM vehicle_listings WHERE id=?",
        key,
      );
      if (existing && Number(input.revision) !== existing.revision)
        throw new HttpError(
          409,
          "This listing changed elsewhere. Reopen the cloud listing before updating; local edits have been kept.",
        );
      if (
        !existing &&
        store.one("SELECT COUNT(*) AS n FROM vehicle_listings").n >= 500
      )
        throw new HttpError(409, "Workspace listing limit reached.");
      const { photos, ...data } = clean,
        revision = (existing?.revision || 0) + 1,
        updated = new Date().toISOString();
      store.sql.exec(
        "INSERT INTO vehicle_listings (id,data,revision,updated,post_id) VALUES (?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision,updated=excluded.updated",
        key,
        JSON.stringify(data),
        revision,
        updated,
      );
      store.sql.exec("DELETE FROM vehicle_photos WHERE listing_id=?", key);
      photos.forEach((p: any, i: number) =>
        store.sql.exec(
          "INSERT INTO vehicle_photos VALUES (?,?,?,?,?)",
          key,
          i,
          p.name,
          p.data,
          p.mediaId &&
            store.one("SELECT id FROM media WHERE id=? AND ready=1", p.mediaId)
            ? p.mediaId
            : null,
        ),
      );
      return { revision, updated };
    });
    return Response.json(result);
  }
  if (r.method === "POST" && path[2] === "planner") {
    if (!old)
      throw new HttpError(
        404,
        "Sync this listing before sending it to the planner.",
      );
    return store.ctx.blockConcurrencyWhile(async () => {
      const row = store.one("SELECT * FROM vehicle_listings WHERE id=?", key);
      if (row.post_id) {
        const post = store.one("SELECT id FROM posts WHERE id=?", row.post_id);
        if (post) return Response.json({ postId: row.post_id, existing: true });
      }
      const item = parse(row);
      if (item.needsRegeneration)
        throw new HttpError(
          400,
          "Vehicle facts changed. Regenerate content before creating a planner draft.",
        );
      if (!item.outputs?.title || !item.outputs?.caption)
        throw new HttpError(400, "Generate and save content first.");
      const mediaIds = [];
      for (const photo of store.rows(
        "SELECT name,data,media_id AS mediaId FROM vehicle_photos WHERE listing_id=? ORDER BY position",
        key,
      )) {
        if (
          photo.mediaId &&
          store.one(
            "SELECT id FROM media WHERE id=? AND ready=1",
            photo.mediaId,
          )
        ) {
          mediaIds.push(photo.mediaId);
          continue;
        }
        const hash = [
          ...new Uint8Array(
            await crypto.subtle.digest(
              "SHA-256",
              new TextEncoder().encode(photo.data),
            ),
          ),
        ]
          .map((n) => n.toString(16).padStart(2, "0"))
          .join("");
        const prior = store.one(
          "SELECT media_id FROM vehicle_media WHERE hash=?",
          hash,
        );
        if (prior?.media_id) {
          mediaIds.push(prior.media_id);
          continue;
        }
        const [head, encoded] = photo.data.split(",");
        const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
        const media = await store.upload(
          new Request("https://studio.internal/media/upload", {
            method: "POST",
            headers: {
              "Content-Type": head.slice(5).split(";")[0],
              "X-File-Size": String(bytes.length),
              "X-File-Name": encodeURIComponent(photo.name),
            },
            body: bytes,
          }),
        );
        store.sql.exec(
          "INSERT INTO vehicle_media VALUES (?,?) ON CONFLICT(hash) DO UPDATE SET media_id=excluded.media_id",
          hash,
          media.id,
        );
        mediaIds.push(media.id);
      }
      const platform = ["Facebook", "Instagram"].includes(
        item.schedule?.channel,
      )
        ? item.schedule.channel
        : "WhatsApp Business";
      const result = store.ctx.storage.transactionSync(() => {
        const post = store.savePost({
          ...emptyPost,
          title: item.outputs.title.slice(0, 200),
          category: "Dream Motors Cars",
          content_type: "Vehicle listing",
          platforms: [platform],
          caption_en: item.outputs.caption,
          hashtags: item.outputs.hashtags || "",
          media_ids: mediaIds,
          scheduled_at: item.schedule?.at || "",
          status: "Draft",
          notes:
            "Imported from Vehicle Listing Generator. Review facts, media rights and platform copy before approval. Listing ID: " +
            key,
        });
        store.sql.exec(
          "UPDATE vehicle_listings SET post_id=? WHERE id=?",
          post.id,
          key,
        );
        return post;
      });
      return Response.json({ postId: result.id, existing: false });
    });
  }
  throw new HttpError(405, "Method not allowed.");
}
