// Run against the local Worker configured with the isolated auth mock only.
import assert from "node:assert/strict";
import { emptyPost } from "../workers-studio/src/model.ts";
const base = "http://localhost:8790";
let cookies = "";
async function call(path, data, method = data ? "POST" : "GET") {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: base,
      Cookie: cookies,
      "Content-Type": "application/json",
    },
    body: data ? JSON.stringify(data) : undefined,
  });
  return {
    status: r.status,
    data: await r.json(),
    cookies: r.headers
      .getSetCookie()
      .map((x) => x.split(";")[0])
      .join("; "),
  };
}
assert.equal((await call("/listings")).status, 401);
assert.equal((await call("/state")).status, 401);
assert.equal(
  (await call("/ai", { action: "extract", message: "Honda City" })).status,
  401,
);
let r = await call("/login", {
  email: "owner@example.test",
  password: "local-only-test-password",
});
assert.equal(r.status, 200, JSON.stringify(r.data));
cookies = r.cookies;
r = await call("/session");
assert.equal(r.data.user.id, "owner-test");
assert.equal(r.data.cloud, true);
const native = await call("/posts", {
  ...emptyPost,
  title: "Existing planner record " + Date.now(),
  content_type: "Text announcement",
  caption_en: "Preserve this record.",
});
assert.equal(native.status, 201, JSON.stringify(native.data));
const originalId = native.data.id;
const before = await call("/state"),
  postCount = before.data.posts.length,
  mediaCount = before.data.media.length;
const id = crypto.randomUUID(),
  item = {
    values: { make: "Daihatsu", model: "Cuore", year: "2005" },
    outputs: {
      title: "2005 Daihatsu Cuore",
      caption: "Details provided by seller; not inspected by Dream Motors.",
      hashtags: "#Daihatsu",
    },
    approved: {},
    photos: [
      {
        name: "photo.png",
        data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      },
    ],
    schedule: {
      at: "2026-12-15T10:00:00Z",
      channel: "Instagram",
      state: "Planned",
    },
  };
r = await call("/listings/" + id, item, "PUT");
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.revision, 1);
assert.equal((await call("/listings/" + id)).data.photos.length, 1);
assert.equal(
  (await call("/listings")).data.listings.find((x) => x.id === id).photoCount,
  1,
);
const preview = await fetch(base + "/api/listings/" + id + "/photo", {
  headers: { Cookie: cookies },
});
assert.equal(preview.status, 200);
assert.equal(preview.headers.get("content-type"), "image/png");
assert.match(preview.headers.get("cache-control"), /private/);
assert.ok((await preview.arrayBuffer()).byteLength > 16);
const blocked = await fetch(base + "/api/listings/" + id + "/photo");
assert.equal(blocked.status, 401);

assert.equal((await call("/listings/" + id, item, "PUT")).status, 409);
r = await call("/listings/" + id + "/planner", {});
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.existing, false);
const postId = r.data.postId;
const again = await call("/listings/" + id + "/planner", {});
assert.equal(again.data.postId, postId);
assert.equal(again.data.existing, true);
const after = await call("/state");
assert.equal(after.data.posts.length, postCount + 1);
assert.ok(
  after.data.media.length >= mediaCount &&
    after.data.media.length <= mediaCount + 1,
);
assert.equal(after.data.posts.find((x) => x.id === postId).status, "Draft");
assert.equal(
  after.data.posts.find((x) => x.id === originalId).caption_en,
  "Preserve this record.",
);
const mediaId = after.data.posts.find((x) => x.id === postId).media_ids[0];
const library = await call("/vehicle-library");
assert.ok(library.data.media.some((x) => x.id === mediaId));
const id2 = crypto.randomUUID();
r = await call(
  "/listings/" + id2,
  { ...item, photos: [{ ...item.photos[0], mediaId }] },
  "PUT",
);
assert.equal(r.status, 200);
assert.equal((await call("/listings/" + id2)).data.photos[0].mediaId, mediaId);
await call("/listings/" + id2 + "/planner", {});
assert.equal((await call("/state")).data.media.length, after.data.media.length);
assert.equal(
  (await call("/export")).data.vehicle_listings.some((x) => x.id === id),
  true,
);
assert.equal(
  (await call("/ai", { action: "generate", values: item.values })).status,
  503,
);
const removed = await call(
  "/listings/" + id,
  { ...item, photos: [], revision: 1 },
  "PUT",
);
assert.equal(removed.status, 200);
assert.equal(
  (await call("/listings")).data.listings.find((x) => x.id === id).photoCount,
  0,
);
assert.equal(
  (
    await fetch(base + "/api/listings/" + id + "/photo", {
      headers: { Cookie: cookies },
    })
  ).status,
  404,
);
await call("/logout", {});
cookies = "";
assert.equal((await call("/listings")).status, 401);
console.log(
  "PASS: existing Supabase auth reused (local mock), private API guards, native posts preserved, listing revisions, planner transfer idempotency, native media reuse, backup and absent-AI handling.",
);
