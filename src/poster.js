import { redact } from "./engine.js";
export async function createPoster({ values, photos = [], format = "feed" }) {
  const canvas = document.createElement("canvas");
  canvas.width = 1080;
  canvas.height = format === "story" ? 1920 : 1350;
  const c = canvas.getContext("2d"),
    h = canvas.height;
  c.fillStyle = "#102f29";
  c.fillRect(0, 0, 1080, h);
  c.fillStyle = "#d9c18b";
  c.font = "bold 28px system-ui";
  c.fillText("DREAM MOTORS", 70, 85);
  c.font = "19px system-ui";
  c.fillStyle = "#b9cbbc";
  c.fillText("WE BUY, SELL & INSPECT VEHICLES.", 70, 122);
  const top = 165,
    photoH = format === "story" ? 820 : 530;
  if (photos[0]) {
    const img = new Image();
    img.src = photos[0].data;
    await img.decode();
    const scale = Math.max(940 / img.width, photoH / img.height);
    c.save();
    c.beginPath();
    c.rect(70, top, 940, photoH);
    c.clip();
    c.drawImage(
      img,
      70 + (940 - img.width * scale) / 2,
      top + (photoH - img.height * scale) / 2,
      img.width * scale,
      img.height * scale,
    );
    c.restore();
  } else {
    c.fillStyle = "#23463a";
    c.fillRect(70, top, 940, photoH);
    c.fillStyle = "#9bb29e";
    c.font = "28px system-ui";
    c.fillText("DREAM MOTORS VEHICLE LISTING", 120, top + photoH / 2);
  }
  let y = top + photoH + 80;
  function line(text, size, color = "#f2f4e9", max = 2) {
    text = redact(String(text || ""));
    c.font = `${size >= 40 ? "bold " : ""}${size}px system-ui`;
    c.fillStyle = color;
    c.textAlign = "left";
    const words = text.split(/\s+/);
    let row = "",
      rows = 0;
    for (const word of words) {
      if (c.measureText(row + " " + word).width > 940 && row) {
        c.fillText(row, 70, y);
        y += size * 1.4;
        rows++;
        row = word;
        if (rows >= max) {
          row = "";
          break;
        }
      } else row += (row ? " " : "") + word;
    }
    if (row) {
      c.fillText(row, 70, y);
      y += size * 1.4;
    }
  }
  line(
    [values.year, values.make, values.model, values.variant]
      .filter((x) => x && x !== "Unknown")
      .join(" "),
    52,
  );
  line(
    values.type === "Car Required" ? "CAR REQUIRED" : "FOR SALE",
    22,
    "#d9c18b",
  );
  y += 12;
  const price =
    values.price && values.price.toLowerCase() !== "unknown"
      ? /^\d[\d,]*$/.test(values.price)
        ? "PKR " +
          Number(values.price.replaceAll(",", "")).toLocaleString("en-PK")
        : values.price
      : "";
  if (price) line(price, 42, "#d9c18b");
  line(
    [
      values.transmission,
      values.mileage && values.mileage !== "Unknown"
        ? values.mileage + " km"
        : "",
      values.location,
    ]
      .filter((x) => x && x.toLowerCase() !== "unknown")
      .join(" · "),
    24,
  );
  y += 12;
  line(
    values.inspection === "Inspected by Dream Motors"
      ? "Inspected by Dream Motors."
      : "Details provided by seller. Not inspected by Dream Motors.",
    20,
    "#bdccbd",
  );
  c.fillStyle = "#d9c18b";
  c.fillRect(70, h - 150, 940, 1);
  c.fillStyle = "#f1f4e8";
  c.font = "bold 36px system-ui";
  c.fillText("0335-4727638", 70, h - 88);
  c.font = "21px system-ui";
  c.fillStyle = "#bbcbbb";
  c.fillText("We Buy, Sell & Inspect Vehicles.", 70, h - 48);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}
export async function compressPhoto(file) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext("2d").drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let data = canvas.toDataURL("image/jpeg", 0.78);
  if (data.length > 700000) data = canvas.toDataURL("image/jpeg", 0.45);
  if (data.length > 800000)
    throw Error("This photo remains too large. Choose a smaller image.");
  return data;
}
