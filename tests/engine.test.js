import { test } from "node:test";
import assert from "node:assert/strict";
import { extract, generate, example, redact } from "../src/engine.js";
test("Cuore facts and all seven formats", () => {
  const { values: v } = extract(example);
  assert.equal(v.make, "Daihatsu");
  assert.equal(v.model, "Cuore");
  assert.equal(v.year, "2005");
  assert.equal(v.price, "1000000");
  assert.equal(v.mileage, "100,000+");
  const out = generate(v);
  assert.equal(Object.keys(out).length, 7);
  assert.match(out.caption, /PKR 1,000,000/);
  assert.match(out.caption, /not inspected by Dream Motors/);
  assert.doesNotMatch(out.caption, /Body:|Engine:|excellent|genuine/i);
  assert.match(out.caption, /0335-4727638/);
});
test("incomplete details never fabricated", () => {
  const out = generate(extract("Toyota Corolla").values);
  assert.doesNotMatch(out.caption, /Mileage:|Demand:|Ownership:/);
  assert.throws(() => generate({ make: "Toyota" }), /make and model/);
});
test("conflicting facts flagged", () => {
  const r = extract("Honda Civic 2005 2006 automatic manual");
  assert.equal(r.values.year, undefined);
  assert.equal(r.values.transmission, undefined);
  assert.ok(r.warnings.some((x) => x.includes("Multiple years")));
  assert.ok(r.warnings.some((x) => x.includes("Conflicting")));
});
test("Urdu numerals and Roman Urdu", () => {
  const r = extract("Suzuki Alto ۲۰۰۵ chahiye\nقیمت: ۱۰ لاکھ\nمقام: لاہور");
  assert.equal(r.values.type, "Car Required");
  assert.equal(r.values.year, "2005");
  assert.equal(r.values.price, "1000000");
  assert.equal(r.values.location, "لاہور");
});
test("seller contacts removed and business contact retained", () => {
  assert.equal(
    redact("Seller 0300-1234567"),
    "Seller [private contact removed]",
  );
  assert.equal(redact("0335-4727638"), "0335-4727638");
  assert.doesNotMatch(
    generate({
      make: "Toyota",
      model: "Corolla",
      remarks: "Call 03001234567 or seller@example.com",
    }).caption,
    /03001234567|seller@example.com/,
  );
});
