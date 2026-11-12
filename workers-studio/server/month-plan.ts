import { emptyPost, platformSchedule } from "../src/model";
export const MONTH_PLAN_ID = "dream-motors-2026-11-08-2026-12-07-v1";
export const MONTH_PLAN_LABEL = "8 November–7 December 2026";
// An owner-approved, fixed calendar. These are planning briefs, not claims about stock or results.
const main = [
  [
    "2026-11-08",
    "Inspect",
    "What a Dream Motors vehicle inspection covers",
    "video",
    "Film a short introduction showing only checks you actually provide. Explain the scope and limitations; invite viewers to message Dream Motors to arrange an inspection.",
  ],
  [
    "2026-11-09",
    "Cars",
    "Walk-around of a real available vehicle",
    "video",
    "Select a genuinely available vehicle with permission to advertise it. Confirm make, model, asking price and condition before recording; hide personal details. If none is available, film how a buyer should prepare for a viewing. Invite private viewing inquiries.",
  ],
  [
    "2026-11-11",
    "Inspect",
    "Paint-meter demonstration: understanding readings",
    "video",
    "Use your actual equipment on an authorised vehicle or demonstration panel. Explain why readings need context; do not claim one reading proves accident history or original paint. Invite an inspection inquiry.",
  ],
  [
    "2026-11-13",
    "Care",
    "Oil and filter service checklist",
    "carousel",
    "Prepare a few concise slides about checking the correct oil specification, filter and service record. Follow the particular manufacturer’s guidance, not a universal service interval. Invite maintenance-assistance inquiries.",
  ],
  [
    "2026-11-15",
    "News",
    "Checking vehicle registration through official portals",
    "carousel",
    "Check the current Punjab and Islamabad official portals before preparing slides. Show where to start, without displaying real CNICs or registration records. Explain that registration, police and customs checks answer different questions. Link the official source and invite buyers to ask about inspections.",
  ],
  [
    "2026-11-16",
    "Cars",
    "Five questions to ask before viewing a used car",
    "video",
    "Cover ownership, documents, recorded mileage, maintenance and viewing arrangements without promising a car’s condition. Ask buyers to send their budget and intended use privately.",
  ],
  [
    "2026-11-18",
    "Inspect",
    "OBD demonstration: a fault code needs diagnosis",
    "video",
    "Film an authorised demonstration with your scanner. Explain that codes are diagnostic clues and that a clear scan does not prove the absence of every issue. Hide identifiers and invite inspection bookings.",
  ],
  [
    "2026-11-20",
    "Care",
    "Checking tyre condition and recommended pressure",
    "video",
    "Show visual checks for wear and damage on approved demonstration footage. Refer viewers to their vehicle’s placard/manual for pressure; do not prescribe a universal number. Invite maintenance assistance.",
  ],
  [
    "2026-11-22",
    "Inspect",
    "What to prepare before booking an inspection",
    "video",
    "Explain the access, vehicle documents and location details you actually need for an inspection. Avoid exposing customer information. Ask viewers to message you to confirm scope and availability.",
  ],
  [
    "2026-11-23",
    "Cars",
    "Features and asking price of a real available vehicle",
    "video",
    "Use a genuinely available, authorised listing and verify its features and current asking price. Describe recorded condition accurately. If no suitable car is available, explain how to compare asking prices responsibly without inventing a valuation. Invite private buyer inquiries.",
  ],
  [
    "2026-11-25",
    "Inspect",
    "Battery-testing demonstration using an actual reading",
    "video",
    "Show a real test on approved footage and explain the tester’s displayed result and limitations. Do not invent readings or guarantees. Invite viewers to ask about an inspection or battery check.",
  ],
  [
    "2026-11-27",
    "Care",
    "What to check before approving denting or painting work",
    "carousel",
    "Prepare a checklist covering scope, estimate, agreed finish and collection checks. Use before/after evidence only with permission and from real work; otherwise use your own clearly educational visuals. Invite repair-management inquiries.",
  ],
  [
    "2026-11-29",
    "News",
    "Verify an official manufacturer announcement before sharing a price update",
    "carousel",
    "Find an actual current manufacturer announcement and record its URL, date, variant and applicable terms before quoting any price. If no announcement is available, make this an educational source-verification checklist with no claimed price change. Invite buyers to ask for help checking vehicle information.",
  ],
  [
    "2026-11-30",
    "Cars",
    "Seller checklist: photographs and information buyers need",
    "video",
    "Explain how to prepare clear photos and accurate vehicle details. Do not show private document identifiers. Ask sellers to share their vehicle details privately with Dream Motors.",
  ],
  [
    "2026-12-02",
    "Inspect",
    "Glass, mirrors and lights: commonly missed checks",
    "video",
    "Film approved close-ups showing the checks you actually perform. Explain visibility, damage and function checks without diagnosing an unseen vehicle. Invite inspection inquiries.",
  ],
  [
    "2026-12-04",
    "Care",
    "Maintenance checks before vehicle delivery",
    "video",
    "Show an educational handover checklist covering agreed work, visible condition, basic functions and receipts. Use customer vehicles only with permission; do not imply work was completed unless it was. Invite managed-maintenance inquiries.",
  ],
  [
    "2026-12-06",
    "Inspect",
    "Inspection FAQs and how to arrange a booking",
    "video",
    "Answer common questions using your actual service scope. Confirm any fees, duration and availability before mentioning them. Invite viewers to message Dream Motors to arrange a booking.",
  ],
  [
    "2026-12-07",
    "Cars",
    "Roundup of genuinely available vehicles",
    "video",
    "Confirm availability and permission for each car before filming. Do not include sold or unverified vehicles as available. If no cars are available, explain how Dream Motors helps buyers source a vehicle and invite budget/usage requirements privately.",
  ],
] as const;
const statusUpdates = [
  [
    "2026-11-10",
    "Cars",
    "Ask buyers for their budget, preferred car and intended use",
    "Prepare a short WhatsApp Status inviting buyers to message their budget, preferred vehicle, city and intended use privately. Do not publish anyone’s reply or contact details.",
  ],
  [
    "2026-11-17",
    "Inspect",
    "Invite inquiries about inspection availability",
    "Prepare a brief inspection Status. Ask customers to message for availability; do not claim free slots or an unverified promotion.",
  ],
  [
    "2026-11-24",
    "Care",
    "Ask customers what maintenance or repair assistance they need",
    "Prepare a short Status inviting private messages about the work a car needs. Describe only services you actually coordinate.",
  ],
  [
    "2026-12-01",
    "Cars",
    "Invite current buying and selling requirements through private messages",
    "Ask buyers and sellers to share current requirements privately. Do not invent available vehicles, completed deals or customer testimonials.",
  ],
] as const;
const at = (day: string, time: string) =>
  new Date(`${day}T${time}:00+05:00`).toISOString();
function makePost(
  day: string,
  category: string,
  title: string,
  format: string,
  brief: string,
  mainPost: boolean,
) {
  const chosen = mainPost
    ? [
        "Facebook",
        "Instagram",
        ...(format === "video" ? ["TikTok"] : []),
        "WhatsApp Business",
      ]
    : ["WhatsApp Business"];
  const weekday = new Date(day + "T12:00:00Z").getUTCDay();
  if (mainPost && [0, 3].includes(weekday)) chosen.push("Personal WhatsApp");
  const times: Record<string, string> = {
    Facebook: "19:00",
    Instagram: "19:30",
    TikTok: "20:00",
    "WhatsApp Business": "13:00",
    "Personal WhatsApp": "20:30",
  };
  const sources =
    day === "2026-11-15"
      ? [
          "https://mtmis.excise.punjab.gov.pk/",
          "https://islamabadexcise.gov.pk/",
        ]
      : [];
  return {
    ...emptyPost,
    planner_only: true,
    title,
    category: "Dream Motors " + category,
    content_type: mainPost
      ? format === "video"
        ? "Short video"
        : "Carousel"
      : "Story",
    platforms: chosen,
    scheduled_at: at(day, mainPost ? "19:00" : "13:00"),
    variants: Object.fromEntries(
      chosen.map((p) => [
        p,
        {
          caption: "",
          hashtags: "",
          media_ids: [],
          scheduled_at: at(day, times[p]),
        },
      ]),
    ),
    status: "Scheduled",
    sources,
    notes: `Approved one-month plan · ${MONTH_PLAN_LABEL}\n\nPreparation: ${brief}\n\n${mainPost ? "Prepare the original before the 1:00 PM WhatsApp Business update. Use a shortened Status version there. " + (chosen.includes("Personal WhatsApp") ? "Personal WhatsApp also gets a short Status version at 8:30 PM. " : "") + (format === "video" ? "Prepare a portrait video suitable for Facebook, Instagram and TikTok; preserve your original." : "Prepare carousel slides for Facebook and Instagram, with one short WhatsApp Status summary. No TikTok task for this carousel.") : "WhatsApp Business Status only."}\n\nCheck factual claims, permissions and privacy before publishing manually. Add verified sources to factual News content. Never invent prices, inventory, findings or testimonials.\nWe Buy, Sell & Inspect Vehicles`,
  };
}
export function approvedMonthPlan() {
  const posts = [
    ...main.map(([day, c, title, f, brief]) =>
      makePost(day, c, title, f, brief, true),
    ),
    ...statusUpdates.map(([day, c, title, brief]) =>
      makePost(day, c, title, "status", brief, false),
    ),
  ].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
  const counts = Object.fromEntries(
    [
      "Facebook",
      "Instagram",
      "TikTok",
      "WhatsApp Business",
      "Personal WhatsApp",
    ].map((p) => [
      p,
      posts.filter((post) => post.platforms.includes(p)).length,
    ]),
  );
  if (
    posts.length !== 22 ||
    JSON.stringify(Object.values(counts)) !==
      JSON.stringify([18, 18, 14, 22, 9])
  )
    throw new Error("Invalid approved calendar totals.");
  for (const post of posts)
    for (const p of post.platforms)
      if (!platformSchedule(post, p)) throw new Error("Missing platform time.");
  return posts;
}
