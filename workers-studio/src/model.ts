export const categories = [
  "Dream Motors News",
  "Dream Motors Cars",
  "Dream Motors Inspect",
  "Dream Motors Care",
] as const;
export const platforms = [
  "Facebook",
  "Instagram",
  "TikTok",
  "WhatsApp Business",
  "Personal WhatsApp",
] as const;
export const statuses = [
  "Idea",
  "Draft",
  "Editing",
  "Ready for Review",
  "Approved",
  "Scheduled",
  "Publishing",
  "Published",
  "Failed",
  "Archived",
] as const;
export const contentTypes = [
  "Image post",
  "Carousel",
  "Reel",
  "Short video",
  "Story",
  "Text announcement",
  "Vehicle listing",
  "News article",
  "Educational post",
] as const;
export type Row = {
  id: string;
  version: number;
  created_at: string;
  updated_at: string;
  [key: string]: any;
};
export type Post = Row & {
  title: string;
  category: string;
  content_type: string;
  platforms: string[];
  caption_en: string;
  caption_ur: string;
  hashtags: string;
  media_ids: string[];
  scheduled_at: string;
  notes: string;
  status: string;
  sources: string[];
  rights_confirmed: boolean;
  campaign_id: string;
  inventory_url: string;
  variants: Record<
    string,
    {
      caption: string;
      hashtags: string;
      media_ids: string[];
      scheduled_at: string;
    }
  >;
};
export const emptyPost = {
  title: "",
  category: categories[1],
  content_type: contentTypes[0],
  platforms: ["Facebook"],
  caption_en: "",
  caption_ur: "",
  hashtags: "",
  media_ids: [],
  scheduled_at: "",
  notes: "",
  status: "Draft",
  sources: [],
  rights_confirmed: false,
  campaign_id: "",
  inventory_url: "",
  variants: {},
};
export const defaultSettings = {
  reminders: true,
  review_alerts: true,
  lead_minutes: 15,
  business_url: "",
  timezone: "Asia/Karachi",
};
export const templates = [
  {
    id: "listing",
    title: "Used-car advertisement",
    category: categories[1],
    content_type: "Vehicle listing",
    caption_en:
      "Available: [make, model, year, variant]\nMileage: [verified reading]\nLocation: [city]\nAsking price: PKR [price]\nCondition: [accurate, supported description]\nContact Dream Motors for details and viewing.\nWe Buy, Sell & Inspect Vehicles",
  },
  {
    id: "launch",
    title: "New vehicle launch",
    category: categories[0],
    content_type: "News article",
    caption_en:
      "[Manufacturer] has announced [model/variant] in Pakistan.\nAnnouncement date: [date]\nKey confirmed specifications: [details]\nOfficial announced price: PKR [price, date and conditions]\nSource: [official link]\nWe Buy, Sell & Inspect Vehicles",
  },
  {
    id: "price",
    title: "Official price change",
    category: categories[0],
    content_type: "News article",
    caption_en:
      "Official price update: [manufacturer, model, variant]\nPrevious: PKR [amount]\nRevised: PKR [amount]\nChange: PKR [amount]\nEffective date: [date]\nSource: [official announcement URL]\nWe Buy, Sell & Inspect Vehicles",
  },
  {
    id: "inspection",
    title: "Inspection promotion",
    category: categories[2],
    content_type: "Educational post",
    caption_en:
      "Buying a used car? Record its condition before making a decision.\nDream Motors inspection: [actual services included]\nLocation: Gujrat, Pakistan\nContact us to arrange an inspection.\nWe Buy, Sell & Inspect Vehicles",
  },
  {
    id: "maintenance",
    title: "Maintenance tip",
    category: categories[3],
    content_type: "Educational post",
    caption_en:
      "Maintenance tip: [topic]\nWhat to check: [vehicle-specific guidance]\nWhen to seek assistance: [conditions]\nRefer to the manufacturer’s maintenance schedule.\nWe Buy, Sell & Inspect Vehicles",
  },
  {
    id: "comparison",
    title: "Vehicle comparison",
    category: categories[0],
    content_type: "Educational post",
    caption_en:
      "[Vehicle A] and [Vehicle B]: a practical comparison\nVariants and model years: [details]\nConfirmed specifications: [facts]\nPrices as of [date]: [details]\nSources: [manufacturer links]\nWe Buy, Sell & Inspect Vehicles",
  },
  {
    id: "before-after",
    title: "Repair before / after",
    category: categories[3],
    content_type: "Short video",
    caption_en:
      "Work completed: [accurate description]\nBefore: [recorded condition]\nAfter: [work and limitations]\nCustomer permission: [confirm before sharing]\nDream Motors Care · Gujrat\nWe Buy, Sell & Inspect Vehicles",
  },
];
export function pktDate(value: string | number | Date = new Date()) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Karachi",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(value));
}
export function pktTime(value: string) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Karachi",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value))
    : "";
}
export function displayTime(value: string) {
  return value
    ? new Intl.DateTimeFormat("en-GB", {
        timeZone: "Asia/Karachi",
        day: "numeric",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(value)) + " PKT"
    : "Not scheduled";
}
export function inputTime(value: string) {
  return value ? pktDate(value) + "T" + pktTime(value) : "";
}
export function toUTC(value: string) {
  return value ? new Date(value + ":00+05:00").toISOString() : "";
}
export function platformSchedule(
  p: Pick<Post, "variants" | "scheduled_at">,
  platform: string,
) {
  return p.variants?.[platform]?.scheduled_at || p.scheduled_at;
}
