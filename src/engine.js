export const fields = [
  ["type", "Listing type"],
  ["make", "Make"],
  ["model", "Model"],
  ["variant", "Variant"],
  ["year", "Model year"],
  ["registration", "Registration city / province"],
  ["registrationYear", "Registration year"],
  ["transmission", "Transmission"],
  ["mileage", "Mileage"],
  ["body", "Exterior / body condition"],
  ["engine", "Engine condition"],
  ["ownership", "Ownership"],
  ["documents", "Original documents"],
  ["biometric", "Biometric availability"],
  ["price", "Demand price (PKR) / best offer"],
  ["location", "Location"],
  ["inspection", "Inspection status"],
  ["remarks", "Seller remarks"],
];
export const formats = [
  ["title", "Listing title"],
  ["caption", "Facebook / Instagram caption"],
  ["hashtags", "Hashtags"],
  ["feed", "Feed poster · 1080 × 1350"],
  ["story", "Story / Status · 1080 × 1920"],
  ["script", "Video narration"],
  ["whatsapp", "WhatsApp message"],
];
export const example = `Daihatsu Cuore\n2005\nAutomatic\nPunjab Registered\n100,000+ km\nDemand: Rs. 1,000,000\nLocation: Gujrat\nSeller's own name\nOriginal documents complete\nBiometric available\nDetails provided by seller\nNot inspected by Dream Motors`;
export function redact(s = "") {
  return s
    .replace(/(?:\+92|0092|0)?[\s-]*3\d{2}[\s-]*\d{3}[\s-]*\d{4}\b/g, (m) =>
      m.replace(/\D/g, "") === "03354727638" ? m : "[private contact removed]",
    )
    .replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[private contact removed]");
}
export function extract(message) {
  const t = message.replace(/[۰-۹٠-٩]/g, (c) =>
    "۰۱۲۳۴۵۶۷۸۹".includes(c)
      ? "۰۱۲۳۴۵۶۷۸۹".indexOf(c)
      : "٠١٢٣٤٥٦٧٨٩".indexOf(c),
  );
  const v = {
    type: /required|چاہیے|chahiye/i.test(t) ? "Car Required" : "For Sale",
    inspection: "Not inspected",
  };
  const warnings = [];
  const makes = [
    "Daihatsu",
    "Toyota",
    "Honda",
    "Suzuki",
    "Kia",
    "Hyundai",
    "Changan",
    "Nissan",
    "Mitsubishi",
    "MG",
  ];
  v.make =
    makes.find((m) => new RegExp(`\\b${m}\\b`, "i").test(t)) ||
    (/ٹویوٹا/.test(t)
      ? "Toyota"
      : /سوزوکی/.test(t)
        ? "Suzuki"
        : /ہونڈا/.test(t)
          ? "Honda"
          : "");
  const model = t.match(
    /\b(Cuore|Corolla|Civic|City|Alto|Mehran|Cultus|Swift|Wagon R|Vitz|Yaris|Sportage|Tucson|Passo)\b/i,
  );
  if (model) v.model = model[1];
  const years = [...new Set(t.match(/\b(?:19|20)\d{2}\b/g) || [])];
  if (years.length === 1) v.year = years[0];
  if (years.length > 1)
    warnings.push(
      "Multiple years found. Confirm model and registration years manually.",
    );
  const auto = /automatic|\bauto\b|آٹومیٹک/i.test(t),
    manual = /manual|مینول/i.test(t);
  if (auto && manual)
    warnings.push(
      "Conflicting transmission information. Select the correct transmission.",
    );
  else if (auto || manual) v.transmission = auto ? "Automatic" : "Manual";
  v.mileage =
    t.match(/\b([\d,]+\+?)\s*(?:km|kms|kilometres|کلومیٹر)/i)?.[1] || "";
  const p = t.match(
    /(?:demand|price|قیمت|ڈیمانڈ)\s*[:：]?\s*(?:Rs\.?|PKR)?\s*([\d,]+(?:\.\d+)?)(?:\s*(lakh|lac|لاکھ|crore|کروڑ))?/i,
  );
  if (p)
    v.price = String(
      Number(p[1].replaceAll(",", "")) *
        (p[2] ? (/crore|کروڑ/i.test(p[2]) ? 10000000 : 100000) : 1),
    );
  else if (/best offer/i.test(t)) v.price = "Best offer";
  v.location =
    t.match(/(?:location|شہر|مقام)\s*[:：]\s*([^\n]+)/i)?.[1]?.trim() || "";
  v.registration =
    t.match(
      /\b(Punjab|Sindh|Islamabad|Lahore|Karachi|KPK|Gujrat)\s*(?:registered|registration|رجسٹرڈ)/i,
    )?.[1] || "";
  if (/own name|apne naam|اپنے نام/i.test(t)) v.ownership = "Seller's own name";
  if (/original documents complete|اصل کاغذات مکمل/i.test(t))
    v.documents = "Original documents complete";
  if (/biometric available|بائیومیٹرک دستیاب/i.test(t))
    v.biometric = "Available";
  warnings.push(
    "Rule-based extraction: review every field. Unrecognized Urdu / Roman Urdu details must be entered manually. Inspection is never verified automatically.",
  );
  return { values: v, warnings };
}
export function generate(values) {
  const v = Object.fromEntries(
    Object.entries(values).map(([k, x]) => [k, redact(String(x || "")).trim()]),
  );
  const known = (x) => x && x.toLowerCase() !== "unknown";
  const car = [v.year, v.make, v.model, v.variant].filter(known).join(" ");
  if (!known(v.make) || !known(v.model))
    throw Error("Enter a make and model before generating.");
  const price = known(v.price)
    ? /^\d[\d,]*$/.test(v.price)
      ? `PKR ${Number(v.price.replaceAll(",", "")).toLocaleString("en-PK")}`
      : v.price
    : "";
  const mileage = known(v.mileage)
    ? `${v.mileage.replace(/\s*(km|kms)$/i, "")} km`
    : "";
  const disclaimer =
    v.inspection === "Inspected by Dream Motors"
      ? "Inspected by Dream Motors. Only the recorded details are included."
      : "Details provided by seller; not inspected by Dream Motors.";
  const facts = [
    ["Transmission", v.transmission],
    ["Mileage", mileage],
    ["Registration", v.registration],
    ["Registration year", v.registrationYear],
    ["Body", v.body],
    ["Engine", v.engine],
    ["Ownership", v.ownership],
    ["Documents", v.documents],
    ["Biometric", v.biometric],
    ["Demand", price],
    ["Location", v.location],
    ["Seller remarks", v.remarks],
  ]
    .filter(([, x]) => known(x))
    .map(([k, x]) => `${k}: ${x}`);
  const title = `${car} — ${v.type === "Car Required" ? "Car Required" : "For Sale"}${known(v.location) ? ` in ${v.location}` : ""}`;
  const footer = "Dream Motors\n0335-4727638\nWe Buy, Sell & Inspect Vehicles.";
  const short = [
    title,
    price,
    known(v.location) ? v.location : "",
    disclaimer,
    footer,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    title,
    caption: [title, ...facts, disclaimer, footer].join("\n"),
    hashtags: [
      ...new Set(
        ["DreamMotors", v.make, v.model, v.location, "PakistanCars"]
          .filter(known)
          .map((x) => "#" + x.replace(/[^\p{L}\p{N}]/gu, "")),
      ),
    ].join(" "),
    feed: short,
    story: short,
    script: [
      title + ".",
      ...facts.map((x) => x + "."),
      disclaimer,
      "Contact Dream Motors on 0335-4727638. We Buy, Sell & Inspect Vehicles.",
    ].join(" "),
    whatsapp: [title, ...facts, disclaimer, footer].join("\n"),
  };
}

export function compactText(text="") { return String(text).split(/\r?\n/).map(line=>line.trim()).filter(Boolean).join("\n"); }
