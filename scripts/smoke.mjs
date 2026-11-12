import assert from "node:assert/strict";
const base = process.env.TEST_BASE_URL || "http://127.0.0.1:8788";
let cookie = "";
const testIp = "192.0.2." + (Math.floor(Math.random() * 250) + 1);
async function call(
  path,
  body,
  method = body ? "POST" : "GET",
  session = cookie,
) {
  const r = await fetch(base + "/api" + path, {
    method,
    headers: {
      Origin: base,
      "CF-Connecting-IP": testIp,
      ...(body ? { "Content-Type": "application/json" } : {}),
      ...(session ? { Cookie: session } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await r.json();
  return {
    status: r.status,
    data,
    cookie: r.headers.get("set-cookie")?.split(";")[0],
  };
}
assert.equal((await call("/session")).data.cloud, true);
assert.equal((await call("/listings")).status, 401);
const suffix = Date.now().toString(36);
let r = await call("/signup", {
  username: "owner-" + suffix,
  password: "local-test-password-123",
});
assert.equal(r.status, 200, JSON.stringify(r.data));
cookie = r.cookie;
const owner = cookie;
assert.equal((await call("/session")).data.user.username, "owner-" + suffix);
const id = crypto.randomUUID(),
  item = {
    values: { make: "Daihatsu", model: "Cuore", year: "2005" },
    outputs: { title: "2005 Daihatsu Cuore" },
    approved: { title: true },
    message: "Original seller text",
    status: "Reserved",
    schedule: {
      at: "2026-11-15T10:00:00Z",
      channel: "Instagram",
      state: "Planned",
    },
    photos: [
      {
        name: "test.png",
        data: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=",
      },
    ],
  };
r = await call("/listings/" + id, item, "PUT");
assert.equal(r.status, 200, JSON.stringify(r.data));
assert.equal(r.data.revision, 1);
r = await call("/listings/" + id);
assert.equal(r.data.photos.length, 1);
assert.equal(r.data.status, "Reserved");
assert.equal(r.data.schedule.channel, "Instagram");
assert.equal(r.data.message, "Original seller text");
assert.equal((await call("/listings/" + id, item, "PUT")).status, 409);
r = await call(
  "/listings/" + id,
  { ...item, revision: 1, status: "Sold" },
  "PUT",
);
assert.equal(r.data.revision, 2);
const simultaneous = await Promise.all([
  call("/listings/" + id, { ...item, revision: 2 }, "PUT"),
  call("/listings/" + id, { ...item, revision: 2 }, "PUT"),
]);
assert.deepEqual(simultaneous.map((x) => x.status).sort(), [200, 409]);
assert.equal((await call("/listings")).data.listings.length, 1);
r = await call("/signup", {
  username: "other-" + suffix,
  password: "local-test-password-456",
});
assert.equal(r.status, 200);
cookie = r.cookie;
assert.equal((await call("/listings")).data.listings.length, 0);
assert.equal((await call("/listings/" + id)).status, 404);
assert.equal(
  (await call("/ai", { action: "generate", values: item.values })).status,
  503,
);
await call("/logout", {});
assert.equal((await call("/listings")).status, 401);
cookie = owner;
assert.equal((await call("/listings/" + id)).data.photos.length, 1);
await call("/logout", {});
assert.equal((await call("/listings")).status, 401);
r = await call("/login", {
  username: "owner-" + suffix,
  password: "wrong-password-000",
});
assert.equal(r.status, 401);
r = await call("/login", {
  username: "owner-" + suffix,
  password: "local-test-password-123",
});
assert.equal(r.status, 200);
for (let i = 0; i < 11; i++)
  r = await call("/login", {
    username: "missing-user",
    password: "wrong-password-000",
  });
assert.equal(r.status, 429);
console.log(
  "PASS: signup/login/logout, secure sessions, private workspaces, listings/photos, revisions and concurrent conflict rejection, absent-AI failure.",
);
