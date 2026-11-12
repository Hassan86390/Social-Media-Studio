import { categories, contentTypes, platforms, statuses } from "../src/model";
export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export function obj(v: unknown): Record<string, any> {
  if (!v || typeof v !== "object" || Array.isArray(v))
    throw new HttpError(400, "Invalid request.");
  return v as Record<string, any>;
}
export function text(v: any, label: string, max = 1000, required = false) {
  if (v == null) v = "";
  if (typeof v !== "string" || v.length > max)
    throw new HttpError(400, `${label} is invalid or too long.`);
  v = v.trim();
  if (required && !v) throw new HttpError(400, `${label} is required.`);
  return v;
}
export function choice(v: any, list: readonly string[], label: string) {
  if (!list.includes(v)) throw new HttpError(400, `Choose a valid ${label}.`);
  return v as string;
}
export function url(v: any, label = "URL", required = false) {
  const value = text(v, label, 2000, required);
  if (!value) return "";
  try {
    const u = new URL(value);
    if (u.protocol !== "https:" || u.username || u.password) throw 0;
    return u.href;
  } catch {
    throw new HttpError(400, `${label} must be a full HTTPS address.`);
  }
}
export function date(v: any, required = false) {
  if (!v && !required) return "";
  const s = text(v, "Date", 40, true);
  const n = new Date(s);
  if (!Number.isFinite(n.getTime()))
    throw new HttpError(400, "Choose a valid date and time.");
  return n.toISOString();
}
export function list(v: any, label = "List", max = 50): string[] {
  if (
    !Array.isArray(v) ||
    v.length > max ||
    v.some((x) => typeof x !== "string" || x.length > 2000)
  )
    throw new HttpError(400, `${label} is invalid.`);
  return [...new Set(v)];
}
export function validatePost(b: Record<string, any>) {
  const out: any = {
    planner_only: b.planner_only === true,
    resource_url: url(b.resource_url, "Content link"),
    resource_note: text(b.resource_note, "File location", 1000),
    title: text(b.title, "Title", 200, true),
    category: choice(b.category, categories, "category"),
    content_type: choice(b.content_type, contentTypes, "content type"),
    platforms: list(b.platforms, "Platforms", 5),
    caption_en: text(b.caption_en, "English caption", 12000),
    caption_ur: text(b.caption_ur, "Urdu caption", 12000),
    hashtags: text(b.hashtags, "Hashtags", 2000),
    media_ids: list(b.media_ids, "Media", 20),
    scheduled_at: date(b.scheduled_at),
    notes: text(b.notes, "Internal notes", 6000),
    status: choice(b.status, statuses, "status"),
    sources: list(b.sources, "Sources", 12).map((x) => url(x, "Source", true)),
    rights_confirmed: b.rights_confirmed === true,
    campaign_id: text(b.campaign_id, "Campaign", 100),
    inventory_url: url(b.inventory_url, "Inventory URL"),
    variants: {},
  };
  if (
    !out.platforms.length ||
    out.platforms.some((p: string) => !platforms.includes(p as any))
  )
    throw new HttpError(400, "Choose at least one supported platform.");
  const variants = obj(b.variants ?? {});
  for (const p of out.platforms) {
    const v = variants[p];
    if (v) {
      const data = obj(v);
      out.variants[p] = {
        caption: text(data.caption, "Platform caption", 12000),
        hashtags: text(data.hashtags, "Platform hashtags", 2000),
        media_ids: list(data.media_ids ?? [], "Platform media", 20),
        scheduled_at: date(data.scheduled_at),
      };
    }
  }
  const reviewing = [
    "Ready for Review",
    "Approved",
    "Scheduled",
    "Publishing",
    "Published",
  ].includes(out.status);
  if (reviewing && !out.planner_only && !out.rights_confirmed)
    throw new HttpError(
      400,
      "Confirm media permission and the privacy check before review or publication.",
    );
  if (
    reviewing &&
    !out.planner_only &&
    out.category === categories[0] &&
    !out.sources.length
  )
    throw new HttpError(
      400,
      "News needs at least one reliable source link before review.",
    );
  if (
    reviewing &&
    !out.planner_only &&
    !out.caption_en &&
    !out.caption_ur &&
    !Object.values(out.variants).some((v: any) => v.caption)
  )
    throw new HttpError(400, "Add a caption before review.");
  if (
    out.status === "Scheduled" &&
    out.platforms.some(
      (p: string) => !(out.variants[p]?.scheduled_at || out.scheduled_at),
    )
  )
    throw new HttpError(400, "Every target platform needs a schedule.");
  const copy = [
    out.caption_en,
    out.caption_ur,
    ...Object.values(out.variants).map((v: any) => v.caption),
  ].join(" ");
  if (/\b\d{5}-\d{7}-\d\b/.test(copy))
    throw new HttpError(400, "Remove the CNIC number from the public caption.");
  return out;
}
export function validateEntity(entity: string, b: Record<string, any>) {
  if (entity === "ideas")
    return {
      title: text(b.title, "Title", 200, true),
      category: choice(b.category, categories, "category"),
      notes: text(b.notes, "Notes", 6000),
      priority: choice(b.priority ?? "P2", ["P1", "P2", "P3"], "priority"),
      audience: text(b.audience, "Audience", 300),
      suggested_at: date(b.suggested_at),
      source_url: url(b.source_url, "Source"),
      converted_post_id: text(b.converted_post_id, "Post", 100),
    };
  if (entity === "campaigns")
    return {
      title: text(b.title, "Campaign name", 200, true),
      notes: text(b.notes, "Notes", 3000),
      target_url: url(b.target_url, "Destination"),
      start_at: date(b.start_at),
      end_at: date(b.end_at),
    };
  if (entity === "templates")
    return {
      title: text(b.title, "Template name", 200, true),
      category: choice(b.category, categories, "category"),
      content_type: choice(b.content_type, contentTypes, "content type"),
      caption_en: text(b.caption_en, "Template caption", 12000),
      caption_ur: text(b.caption_ur, "Urdu template", 12000),
    };
  if (entity === "plans")
    return {
      title: text(b.title, "Plan name", 200, true),
      category: choice(b.category, categories, "category"),
      notes: text(b.notes, "Notes", 3000),
      frequency: choice(
        b.frequency,
        ["Weekly", "Fortnightly", "Monthly"],
        "frequency",
      ),
      next_at: date(b.next_at, true),
      active: b.active !== false,
    };
  if (entity === "inquiries")
    return {
      name: text(b.name, "Contact name", 150, true),
      phone: text(b.phone, "Contact phone", 40),
      kind: choice(
        b.kind,
        ["Buyer", "Seller", "Inspection", "Care"],
        "inquiry type",
      ),
      stage: choice(
        b.stage,
        ["Inquiry", "Qualified", "Booked", "Completed", "Lost"],
        "stage",
      ),
      attribution: choice(
        b.attribution,
        ["Confirmed", "Estimated"],
        "attribution",
      ),
      post_id: text(b.post_id, "Post", 100),
      campaign_id: text(b.campaign_id, "Campaign", 100),
      platform: choice(b.platform, platforms, "platform"),
      crm_url: url(b.crm_url, "CRM record"),
      notes: text(b.notes, "Private notes", 4000),
    };
  if (entity === "analytics") {
    const out: any = {
      post_id: text(b.post_id, "Post", 100, true),
      platform: choice(b.platform, platforms, "platform"),
      recorded_at: date(b.recorded_at, true),
      notes: text(b.notes, "Notes", 2000),
      source: "Manual",
    };
    for (const k of [
      "reach",
      "impressions",
      "views",
      "likes",
      "comments",
      "shares",
      "saves",
      "profile_visits",
      "link_clicks",
      "followers",
    ]) {
      const v = b[k];
      if (v === "" || v == null) out[k] = null;
      else if (!Number.isSafeInteger(Number(v)) || Number(v) < 0)
        throw new HttpError(400, "Metrics must be non-negative whole numbers.");
      else out[k] = Number(v);
    }
    return out;
  }
  if (entity === "media")
    return {
      title: text(b.title, "Title", 200, true),
      category: b.category ? choice(b.category, categories, "category") : "",
      vehicle: text(b.vehicle, "Vehicle", 200),
      campaign_id: text(b.campaign_id, "Campaign", 100),
      status: choice(
        b.status ?? "Available",
        ["Available", "Editing", "Approved", "Archived"],
        "media status",
      ),
      tags: text(b.tags, "Tags", 1000),
      rights_confirmed: b.rights_confirmed === true,
    };
  throw new HttpError(404, "Unknown record type.");
}
