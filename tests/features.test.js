import { test } from "node:test";
import assert from "node:assert/strict";
import { sanitizeListing } from "../server/worker.js";
import worker from "../server/worker.js";
import { calendarICS, localDateTime } from "../src/planner.js";
const valid = {
  values: { make: "Daihatsu", model: "Cuore" },
  outputs: { caption: "Call 03001234567" },
  approved: { caption: true },
  photos: [],
};
test("cloud validation limits data and strips private contacts", () => {
  const v = sanitizeListing(valid);
  assert.doesNotMatch(v.outputs.caption, /03001234567/);
  assert.equal(v.status, "Available");
  assert.throws(() => sanitizeListing({ values: {} }), /Make and model/);
  assert.throws(
    () =>
      sanitizeListing({
        ...valid,
        photos: [{ name: "bad", data: "data:text/html;base64,PHNjcmlwdD4=" }],
      }),
    /Photo is invalid/,
  );
  assert.throws(
    () => sanitizeListing({ ...valid, schedule: { at: "nonsense" } }),
    /calendar date/,
  );
  assert.throws(
    () =>
      sanitizeListing({ ...valid, outputs: { caption: "a".repeat(12001) } }),
    /size limit/,
  );
});
test("calendar exports UTC events with escaped text", () => {
  const ics = calendarICS([
    {
      id: "test",
      values: { make: "Toyota", model: "Corolla, GLi" },
      schedule: {
        at: "2026-11-13T05:00:00Z",
        channel: "Facebook",
        state: "Planned",
      },
    },
  ]);
  assert.match(ics, /DTSTART:20261113T050000Z/);
  assert.match(ics, /Corolla\\, GLi/);
  assert.match(ics, /manual posting/i);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.equal(localDateTime("invalid"), "");
});
test("API rejects cross-site writes and advertises unavailable backend safely", async () => {
  const bad = await worker.fetch(
    new Request("https://example.com/api/signup", {
      method: "POST",
      headers: { Origin: "https://evil.example" },
      body: "{}",
    }),
    {},
  );
  assert.equal(bad.status, 403);
  const r = await worker.fetch(
    new Request("https://example.com/api/session"),
    {},
  );
  assert.deepEqual(await r.json(), { cloud: false, ai: false, user: null });
  assert.equal(r.headers.get("Cache-Control"), "no-store");
});
test("AI schema validation, redaction and disclaimer enforcement (mock provider)", async () => {
  const original = globalThis.fetch;
  const db = {
    prepare() {
      return {
        bind() {
          return this;
        },
        async first() {
          return { id: "user-1", username: "test", count: 1 };
        },
        async run() {
          return { success: true };
        },
      };
    },
  };
  const base = "https://example.com";
  const request = (data) =>
    new Request(base + "/api/ai", {
      method: "POST",
      headers: {
        Origin: base,
        Cookie: "dm_session=" + "a".repeat(64),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  try {
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                values: {
                  make: "Honda",
                  model: "City",
                  inspection: "Inspected by Dream Motors",
                },
                warnings: ["Uncertain year"],
              }),
            },
          },
        ],
      });
    let r = await worker.fetch(
      request({ action: "extract", message: "Honda City" }),
      { DB: db, OPENAI_API_KEY: "test-placeholder" },
    );
    assert.equal(r.status, 200);
    assert.equal((await r.json()).values.inspection, "Not inspected");
    globalThis.fetch = async () =>
      Response.json({
        choices: [
          {
            message: {
              content: JSON.stringify({
                outputs: {
                  title: "Honda City",
                  caption: "Seller 03001234567",
                  hashtags: "#Honda",
                  feed: "Honda City",
                  story: "Honda City",
                  script: "Honda City",
                  whatsapp: "Honda City",
                },
              }),
            },
          },
        ],
      });
    r = await worker.fetch(
      request({ action: "generate", values: { make: "Honda", model: "City" } }),
      { DB: db, OPENAI_API_KEY: "test-placeholder" },
    );
    const data = await r.json();
    assert.equal(r.status, 200);
    assert.match(data.outputs.caption, /not inspected by Dream Motors/);
    assert.doesNotMatch(data.outputs.caption, /03001234567/);
    globalThis.fetch = async () =>
      Response.json({ choices: [{ message: { content: "{}" } }] });
    r = await worker.fetch(
      request({ action: "generate", values: { make: "Honda", model: "City" } }),
      { DB: db, OPENAI_API_KEY: "test-placeholder" },
    );
    assert.equal(r.status, 502);
  } finally {
    globalThis.fetch = original;
  }
});
