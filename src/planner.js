export function localDateTime(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
const escape = (s) =>
  String(s || "")
    .replaceAll("\\", "\\\\")
    .replaceAll("\n", "\\n")
    .replaceAll(",", "\\,")
    .replaceAll(";", "\\;")
    .replace(/\r/g, "");
const stamp = (iso) =>
  new Date(iso)
    .toISOString()
    .replace(/[-:]/g, "")
    .replace(/\.\d{3}/, "");
export function calendarICS(items) {
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Dream Motors//Listing Studio//EN",
    ...items
      .filter(
        (x) => x.schedule?.at && Number.isFinite(Date.parse(x.schedule.at)),
      )
      .flatMap((x) => [
        "BEGIN:VEVENT",
        `UID:${escape(x.id)}@dream-motors-studio.pages.dev`,
        `DTSTAMP:${stamp(new Date())}`,
        `DTSTART:${stamp(x.schedule.at)}`,
        `DTEND:${stamp(new Date(Date.parse(x.schedule.at) + 1800000))}`,
        `SUMMARY:${escape([x.schedule.channel, x.values?.make, x.values?.model].filter(Boolean).join(" · "))}`,
        `DESCRIPTION:${escape("Manual posting reminder. Status: " + (x.schedule.state || "Planned"))}`,
        "END:VEVENT",
      ]),
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}
