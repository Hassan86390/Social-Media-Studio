import {
  fields,
  formats,
  example,
  extract,
  generate,
  redact,
} from "./engine.js";
import { createPoster, compressPhoto } from "./poster.js";
import { calendarICS, localDateTime } from "./planner.js";
const existingStudio = location.pathname.startsWith("/vehicles");
const $ = (id) => document.getElementById(id);
let current = {
  id: crypto.randomUUID(),
  outputs: {},
  approved: {},
  photos: [],
};
let db;
const notify = (text) => {
  $("status").textContent = text;
};
for (const [key, label] of fields) {
  const wrap = document.createElement("div"),
    lab = document.createElement("label");
  lab.htmlFor = key;
  lab.textContent = label + (key === "make" || key === "model" ? " *" : "");
  let input;
  if (["type", "transmission", "inspection"].includes(key)) {
    input = document.createElement("select");
    const options =
      key === "type"
        ? ["For Sale", "Car Required"]
        : key === "transmission"
          ? ["", "Automatic", "Manual", "Unknown"]
          : ["Not inspected", "Inspected by Dream Motors"];
    for (const x of options) {
      const opt = document.createElement("option");
      opt.value = x;
      opt.textContent = x || "Not specified";
      input.append(opt);
    }
  } else {
    input = document.createElement("input");
    input.maxLength = key === "remarks" ? 1500 : 150;
    input.placeholder = ["make", "model"].includes(key)
      ? "Required"
      : "Optional / Unknown";
  }
  input.id = key;
  input.name = key;
  if (["make", "model"].includes(key)) input.required = true;
  wrap.append(lab, input);
  $("fields").append(wrap);
}
const values = () =>
  Object.fromEntries(fields.map(([key]) => [key, $(key).value]));
function fill(v = {}) {
  for (const [k] of fields)
    $(k).value =
      v[k] ||
      (k === "type" ? "For Sale" : k === "inspection" ? "Not inspected" : "");
}
function dirty() {
  if (Object.keys(current.outputs).length) {
    current.outputs = {};
    current.approved = {};
    renderOutputs();
    notify("Vehicle facts changed. Generate updated content before approval.");
  }
}
$("vehicleForm").addEventListener("input", (e) => {
  if (fields.some(([k]) => k === e.target.id)) dirty();
});
function renderOutputs() {
  $("outputs").replaceChildren();
  $("empty").hidden = Object.keys(current.outputs).length > 0;
  for (const [key, label] of formats) {
    if (!(key in current.outputs)) continue;
    const card = document.createElement("div");
    card.className = "output" + (current.approved[key] ? " approved" : "");
    const heading = document.createElement("h3");
    heading.textContent = label + (current.approved[key] ? " · Approved" : "");
    const area = document.createElement("textarea");
    area.value = current.outputs[key];
    area.rows = key === "caption" ? 9 : 4;
    area.setAttribute("aria-label", label);
    area.readOnly = !!current.approved[key];
    area.oninput = () => {
      current.outputs[key] = area.value;
      current.approved[key] = false;
      updateApproval();
    };
    const tools = document.createElement("div");
    tools.className = "tools";
    for (const [name, fn] of [
      [
        "Copy",
        async () => {
          try {
            await navigator.clipboard.writeText(
              redact(current.outputs[key]).replaceAll(
                "[private contact removed]",
                "",
              ),
            );
            notify("Content copied.");
          } catch {
            notify("Clipboard unavailable. Select the text and copy manually.");
          }
        },
      ],
      [
        "Edit",
        () => {
          current.approved[key] = false;
          renderOutputs();
        },
      ],
      [
        "Regenerate",
        async () => {
          if (
            current.approved[key] &&
            !confirm("Replace this approved format?")
          )
            return;
          try {
            await generateContent(key);
          } catch (e) {
            notify(e.message);
          }
        },
      ],
      [
        "Approve",
        () => {
          if (!current.outputs[key].trim())
            return notify("This format is empty.");
          current.outputs[key] = redact(current.outputs[key]);
          current.approved[key] = true;
          renderOutputs();
          notify("Format approved. Save draft to retain your approval.");
        },
      ],
    ]) {
      const b = document.createElement("button");
      b.textContent = name;
      b.onclick = fn;
      tools.append(b);
    }
    card.append(heading, area, tools);
    $("outputs").append(card);
  }
  updateApproval();
}
function updateApproval() {
  $("approval").textContent = formats.every(([k]) => current.approved[k])
    ? "APPROVED"
    : "DRAFT";
}
function renderPhotos() {
  $("photoList").replaceChildren();
  current.photos.forEach((p, i) => {
    const box = document.createElement("div"),
      img = document.createElement("img"),
      b = document.createElement("button");
    img.src = p.data;
    img.alt = p.name;
    b.textContent = "Remove";
    b.type = "button";
    b.onclick = () => {
      current.photos.splice(i, 1);
      renderPhotos();
    };
    box.append(img, b);
    $("photoList").append(box);
  });
}
$("photos").onchange = async (e) => {
  for (const f of e.target.files) {
    if (current.photos.length >= 8) {
      notify("Maximum eight photographs.");
      break;
    }
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(f.type) ||
      f.size > 3 * 1024 * 1024
    ) {
      notify("Skipped unsupported file or image larger than 3 MB.");
      continue;
    }
    try {
      const data = await compressPhoto(f);
      current.photos.push({ name: f.name, data });
    } catch (error) {
      notify(error.message);
    }
  }
  renderPhotos();
  e.target.value = "";
};
function showStudio() {
  showPanel("workspace", "studioNav");
}
$("studioNav").onclick = showStudio;
$("pasteTab").onclick = () => {
  $("pastePanel").hidden = false;
  $("pasteTab").classList.add("selected");
  $("manualTab").classList.remove("selected");
};
$("manualTab").onclick = () => {
  $("pastePanel").hidden = true;
  $("manualTab").classList.add("selected");
  $("pasteTab").classList.remove("selected");
  $("make").focus();
};
$("example").onclick = () => {
  $("message").value = example;
};
$("extract").onclick = async () => {
  if (!$("message").value.trim())
    return notify("Paste a seller message first.");
  if (
    Object.values(values()).some(
      (v, i) => !["type", "inspection"].includes(fields[i][0]) && v,
    ) &&
    !confirm("Replace the current vehicle details with extracted information?")
  )
    return;
  const snapshot = $("message").value,
    id = current.id;
  const button = $("extract");
  button.disabled = true;
  try {
    const r =
      $("generationMode").value === "ai"
        ? await api("/api/ai", {
            method: "POST",
            body: { action: "extract", message: snapshot },
          })
        : extract(snapshot);
    if (current.id !== id || $("message").value !== snapshot)
      return notify("Message changed during extraction. Please extract again.");
    fill(r.values);
    dirty();
    $("warnings").replaceChildren();
    for (const w of r.warnings) {
      const p = document.createElement("div");
      p.className = "warning";
      p.textContent = w;
      $("warnings").append(p);
    }
    notify("Details extracted. Confirm the fields below before generating.");
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
  }
};
$("vehicleForm").onsubmit = async (e) => {
  e.preventDefault();
  try {
    validateYears();
    if (
      Object.values(current.approved).some(Boolean) &&
      !confirm("Generate all formats again, replacing approved content?")
    )
      return;
    await generateContent();
  } catch (e) {
    notify(e.message);
  }
};
function requestStore(mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction("drafts", mode);
    const req = fn(tx.objectStore("drafts"));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
async function refreshDrafts() {
  if (!db) return;
  const items = await requestStore("readonly", (s) => s.getAll());
  $("count").textContent = items.length;
  $("draftList").replaceChildren();
  if (!items.length) $("draftList").textContent = "No saved listings yet.";
  items
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .forEach((item) => {
      const row = document.createElement("button");
      row.className = "draft-row";
      row.textContent = `${item.values.make || "Untitled"} ${item.values.model || "listing"} · ${item.values.year || ""} — ${formats.every(([k]) => item.approved[k]) ? "Approved" : "Draft"} · ${new Date(item.updated).toLocaleString()}`;
      row.onclick = () => {
        if (
          !confirm(
            "Open this saved listing? Unsaved edits in the current listing will be replaced.",
          )
        )
          return;
        openListing(item);
      };
      $("draftList").append(row);
    });
}
$("draftNav").onclick = async () => {
  showPanel("draftPanel", "draftNav");
  await refreshDrafts();
};
$("save").onclick = async () => {
  if (!db)
    return notify("Browser storage is unavailable. Export your draft instead.");
  if (!$("make").value.trim() || !$("model").value.trim())
    return notify("Enter a make and model before saving.");
  try {
    const existing = await requestStore("readonly", (s) => s.get(current.id));
    if (
      existing &&
      !confirm("Update this saved draft with your current edits?")
    )
      return;
    const item = snapshotListing();
    await requestStore("readwrite", (s) => s.put(item));
    await refreshDrafts();
    notify("Draft and photographs saved in this browser.");
  } catch {
    notify("Save failed. Storage may be full or disabled. Export a backup.");
  }
};
function download(content, name, type) {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
$("export").onclick = () =>
  download(
    JSON.stringify(snapshotListing(), null, 2),
    "dream-motors-private-draft.json",
    "application/json",
  );
$("exportCopy").onclick = () =>
  download(
    formats
      .filter(([k]) => current.outputs[k])
      .map(([k, label]) => `${label}\n${redact(current.outputs[k])}`)
      .join("\n\n---\n\n"),
    "dream-motors-public-copy.txt",
    "text/plain",
  );
$("new").onclick = () => {
  if (
    !confirm(
      "Start a new listing? Save or export any edits you want to keep first.",
    )
  )
    return;
  current = { id: crypto.randomUUID(), outputs: {}, approved: {}, photos: [] };
  fill();
  setPlanning({});
  $("message").value = "";
  $("warnings").replaceChildren();
  renderOutputs();
  renderPhotos();
  showStudio();
  notify("New listing started.");
};
try {
  const req = indexedDB.open("dream-motors", 1);
  req.onupgradeneeded = () =>
    req.result.createObjectStore("drafts", { keyPath: "id" });
  req.onsuccess = () => {
    db = req.result;
    refreshDrafts().catch(() => notify("Could not read saved listings."));
  };
  req.onerror = () =>
    notify("Browser storage is unavailable. Use JSON export for backups.");
} catch {
  notify("Browser storage is unavailable. Use JSON export for backups.");
}

// Cloud features are optional: local drafts remain usable if the API is offline.
let session = { cloud: false, ai: false, user: null },
  listingCache = [];
async function api(path, { method = "GET", body } = {}) {
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("Cloud services are unavailable. Your local drafts are safe.");
  }
  if (!response.ok)
    throw Object.assign(Error(data.error || "Cloud request failed."), {
      status: response.status,
    });
  return data;
}
function showPanel(id, nav) {
  for (const panel of [
    "workspace",
    "draftPanel",
    "inventoryPanel",
    "calendarPanel",
    "accountPanel",
  ])
    $(panel).hidden = panel !== id;
  for (const name of [
    "studioNav",
    "draftNav",
    "inventoryNav",
    "calendarNav",
    "accountNav",
  ])
    $(name).classList.toggle("active", name === nav);
}
function validateYears() {
  for (const k of ["year", "registrationYear"]) {
    const y = $(k).value;
    if (
      y &&
      y.toLowerCase() !== "unknown" &&
      (!/^\d{4}$/.test(y) || +y < 1900 || +y > new Date().getFullYear() + 1)
    )
      throw Error("Enter a valid " + k + " or leave it blank.");
  }
}
async function generateContent(key) {
  validateYears();
  const confirmed = values(),
    id = current.id,
    mode = $("generationMode").value;
  generate(confirmed);
  const button = $("vehicleForm").querySelector("button[type=submit]");
  button.disabled = true;
  try {
    const out =
      mode === "ai"
        ? (
            await api("/api/ai", {
              method: "POST",
              body: {
                action: "generate",
                values: confirmed,
                language: $("language").value,
              },
            })
          ).outputs
        : generate(confirmed);
    if (
      id !== current.id ||
      JSON.stringify(confirmed) !== JSON.stringify(values())
    )
      return notify(
        "Vehicle facts changed. Generate again using the latest details.",
      );
    if (key) {
      current.outputs[key] = out[key];
      current.approved[key] = false;
    } else {
      current.outputs = out;
      current.approved = {};
    }
    renderOutputs();
    notify(
      mode === "ai"
        ? "AI content generated. Verify every claim and number before approval."
        : "Content generated from reviewed facts. Review and approve each format.",
    );
  } finally {
    button.disabled = false;
  }
}
function planning() {
  const date = $("scheduleAt").value;
  return {
    status: $("listingStatus").value,
    schedule: {
      at: date ? new Date(date).toISOString() : "",
      channel: $("scheduleChannel").value,
      state: $("scheduleState").value,
    },
  };
}
function setPlanning(item) {
  $("listingStatus").value = item.status || "Available";
  $("scheduleAt").value = localDateTime(item.schedule?.at);
  $("scheduleChannel").value = item.schedule?.channel || "Facebook";
  $("scheduleState").value = item.schedule?.state || "Planned";
}
function snapshotListing() {
  return {
    ...current,
    ...planning(),
    values: values(),
    message: $("message").value,
    updated: new Date().toISOString(),
  };
}
function openListing(item) {
  current = structuredClone(item);
  fill(item.values);
  setPlanning(item);
  $("message").value = item.message || "";
  $("warnings").replaceChildren();
  renderOutputs();
  renderPhotos();
  showStudio();
  notify(
    "Listing reopened. Changes are saved only when you choose Save draft or Sync to cloud.",
  );
}
function renderAccount() {
  const logged = !!session.user;
  $("authForm").hidden = logged;
  $("signedIn").hidden = !logged;
  $("identity").textContent = logged
    ? "Signed in as " + session.user.username
    : "";
  $("cloudStatus").textContent = session.cloud
    ? logged
      ? "Cloud workspace connected. Sync listings individually to upload their details and photos."
      : "Create an account or sign in to your private cloud workspace."
    : "Cloud storage is not configured. Local drafts, inventory, calendar and posters remain available.";
  if (session.cloud)
    $("cloudStatus").textContent += session.ai
      ? " OpenAI is connected."
      : " OpenAI is not connected yet; templates are available.";
  $("sync").disabled = !logged;
  $("signup").disabled = !session.cloud;
  if (existingStudio) {
    $("signup").hidden = true;
    if (!logged && session.cloud)
      $("cloudStatus").textContent =
        "Sign in with the same authorised account used in the main planner. No separate account is needed.";
  }
  $("authForm").querySelector("button[type=submit]").disabled = !session.cloud;
}
async function checkSession() {
  try {
    session = await api("/api/session");
  } catch (error) {
    session = {
      cloud: existingStudio && error.status === 401,
      ai: false,
      user: null,
    };
  }
  renderAccount();
}
$("accountNav").onclick = () => {
  showPanel("accountPanel", "accountNav");
  checkSession();
};
async function authenticate(signup = false) {
  if (!$("authForm").reportValidity()) return;
  const buttons = $("authForm").querySelectorAll("button");
  buttons.forEach((b) => (b.disabled = true));
  try {
    await api(signup ? "/api/signup" : "/api/login", {
      method: "POST",
      body: {
        [existingStudio ? "email" : "username"]: $("username").value,
        password: $("password").value,
      },
    });
    $("password").value = "";
    await checkSession();
    notify(
      "Signed in. Your existing browser drafts have not been uploaded. Use Sync to cloud on each listing you want to keep online.",
    );
  } catch (error) {
    notify(error.message);
  } finally {
    renderAccount();
  }
}
$("authForm").onsubmit = (e) => {
  e.preventDefault();
  authenticate();
};
$("signup").onclick = () => authenticate(true);
$("logout").onclick = async () => {
  try {
    await api("/api/logout", { method: "POST" });
    session.user = null;
    listingCache = [];
    renderAccount();
    notify("Signed out. Local drafts remain in this browser.");
  } catch (error) {
    notify(error.message);
  }
};
$("sync").onclick = async () => {
  if (!session.user) return notify("Sign in first.");
  if (!$("make").value.trim() || !$("model").value.trim())
    return notify("Enter a make and model first.");
  const item = snapshotListing();
  if (item.cloudOwner && item.cloudOwner !== session.user.id)
    return notify(
      "This draft belongs to another cloud account. Start a new listing to avoid mixing accounts.",
    );
  if (
    !confirm(
      "Upload this listing, original seller message and photos to your private cloud workspace?",
    )
  )
    return;
  const button = $("sync");
  button.disabled = true;
  try {
    const result = await api("/api/listings/" + item.id, {
      method: "PUT",
      body: {
        ...item,
        revision: item.cloudOwner === session.user.id ? item.revision : 0,
      },
    });
    if (current.id === item.id) {
      current.revision = result.revision;
      current.cloudOwner = session.user.id;
    }
    if (db)
      await requestStore("readwrite", (s) =>
        s.put({
          ...item,
          revision: result.revision,
          cloudOwner: session.user.id,
        }),
      );
    notify("Listing synced to your private cloud workspace.");
    refreshDrafts();
  } catch (error) {
    notify(error.message);
  } finally {
    button.disabled = false;
  }
};
async function loadListings() {
  const local = db ? await requestStore("readonly", (s) => s.getAll()) : [];
  const merged = new Map(
    local.map((x) => [x.id, { ...x, source: "This browser" }]),
  );
  if (session.user) {
    try {
      const { listings } = await api("/api/listings");
      for (const item of listings) {
        const existing = merged.get(item.id);
        if (
          !existing ||
          Date.parse(item.updated) >= Date.parse(existing.updated)
        )
          merged.set(item.id, {
            ...item,
            cloudOwner: session.user.id,
            source: "Cloud",
          });
      }
    } catch (error) {
      notify(error.message + " Showing local listings.");
    }
  }
  return [...merged.values()].sort((a, b) =>
    String(b.updated).localeCompare(String(a.updated)),
  );
}
async function openInventoryItem(item) {
  if (!confirm("Open this listing? Save any current edits first.")) return;
  try {
    const full =
      item.source === "Cloud"
        ? {
            ...(await api("/api/listings/" + item.id)),
            cloudOwner: session.user.id,
          }
        : item;
    openListing(full);
  } catch (error) {
    notify(error.message);
  }
}
function listingRow(item) {
  const row = document.createElement("button");
  row.className = "draft-row inventory-row";
  const title = document.createElement("strong");
  title.textContent =
    [item.values?.year, item.values?.make, item.values?.model]
      .filter(Boolean)
      .join(" ") || "Untitled";
  const detail = document.createElement("span");
  detail.textContent = [
    item.status || "Available",
    item.values?.location,
    item.source,
    item.schedule?.at ? new Date(item.schedule.at).toLocaleString() : null,
  ]
    .filter(Boolean)
    .join(" · ");
  row.append(title, detail);
  row.onclick = () => openInventoryItem(item);
  return row;
}
function renderInventory() {
  const q = $("inventorySearch").value.toLowerCase(),
    filter = $("inventoryFilter").value,
    items = listingCache.filter(
      (x) =>
        (!filter || (x.status || "Available") === filter) &&
        [x.values?.make, x.values?.model, x.values?.year, x.values?.location]
          .join(" ")
          .toLowerCase()
          .includes(q),
    );
  $("inventoryList").replaceChildren(...items.map(listingRow));
  if (!items.length)
    $("inventoryList").textContent =
      "No matching vehicles. Save a listing to add it to your inventory.";
}
$("inventoryNav").onclick = async () => {
  showPanel("inventoryPanel", "inventoryNav");
  try {
    listingCache = await loadListings();
    renderInventory();
  } catch (error) {
    notify(error.message);
  }
};
$("inventorySearch").oninput = renderInventory;
$("inventoryFilter").onchange = renderInventory;
$("calendarMonth").value =
  new Date().getFullYear() +
  "-" +
  String(new Date().getMonth() + 1).padStart(2, "0");
function calendarItems() {
  return listingCache.filter(
    (x) =>
      x.schedule?.at &&
      localDateTime(x.schedule.at).startsWith($("calendarMonth").value) &&
      (!$("calendarFilter").value ||
        x.schedule.channel === $("calendarFilter").value),
  );
}
function renderCalendar() {
  const items = calendarItems().sort((a, b) =>
    a.schedule.at.localeCompare(b.schedule.at),
  );
  $("calendarGrid").replaceChildren();
  const [year, month] = $("calendarMonth").value.split("-").map(Number);
  if (!year || !month) return;
  for (const name of ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]) {
    const d = document.createElement("strong");
    d.textContent = name;
    $("calendarGrid").append(d);
  }
  const offset = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  for (let n = 0; n < offset; n++)
    $("calendarGrid").append(document.createElement("span"));
  for (let day = 1; day <= new Date(year, month, 0).getDate(); day++) {
    const cell = document.createElement("div");
    cell.className = "calendar-day";
    const label = document.createElement("span");
    label.textContent = day;
    cell.append(label);
    const dayItems = items.filter(
      (x) => new Date(x.schedule.at).getDate() === day,
    );
    for (const item of dayItems) {
      const b = document.createElement("button");
      b.textContent =
        (item.values?.model || "Listing") + " · " + item.schedule.channel;
      b.title = new Date(item.schedule.at).toLocaleString();
      b.onclick = () => openInventoryItem(item);
      cell.append(b);
    }
    $("calendarGrid").append(cell);
  }
  $("calendarList").replaceChildren(
    ...items.map((item) => {
      const row = listingRow(item);
      row.querySelector("span").textContent =
        `${new Date(item.schedule.at).toLocaleString()} · ${item.schedule.channel} · ${item.schedule.state} · ${item.source}`;
      return row;
    }),
  );
  if (!items.length)
    $("calendarList").textContent =
      "No planned posts this month. Set a date and channel on a listing, then save it.";
}
$("calendarNav").onclick = async () => {
  showPanel("calendarPanel", "calendarNav");
  try {
    listingCache = await loadListings();
    renderCalendar();
  } catch (error) {
    notify(error.message);
  }
};
$("calendarMonth").onchange = renderCalendar;
$("calendarFilter").onchange = renderCalendar;
$("exportCalendar").onclick = () =>
  download(
    calendarICS(calendarItems()),
    "dream-motors-calendar.ics",
    "text/calendar",
  );
for (const [id, format] of [
  ["posterFeed", "feed"],
  ["posterStory", "story"],
])
  $(id).onclick = async () => {
    const button = $(id);
    button.disabled = true;
    try {
      validateYears();
      generate(values());
      const blob = await createPoster({
        values: values(),
        photos: current.photos,
        format,
      });
      download(blob, `dream-motors-${format}.png`, "image/png");
      notify("Poster downloaded. Review its facts before sharing.");
    } catch (error) {
      notify(error.message);
    } finally {
      button.disabled = false;
    }
  };
checkSession();

if (existingStudio) {
  $("username").type = "email";
  $("username").removeAttribute("pattern");
  $("username").maxLength = 254;
  $("username").previousElementSibling.textContent = "Planner account email";
  $("password").minLength = 1;
  $("password").previousElementSibling.textContent = "Planner account password";
  $("authForm").querySelector(".hint").textContent =
    "Use your existing planner login. Account access and password recovery are managed by the main studio.";
  const back = document.createElement("a");
  back.className = "nav";
  back.href = "/";
  back.textContent = "← Back to main planner";
  document.querySelector(".nav-label").after(back);
  const send = document.createElement("button");
  send.className = "secondary";
  send.id = "sendPlanner";
  send.textContent = "Send to main planner";
  $("sync").after(send);
  send.onclick = async () => {
    if (!session.user)
      return notify("Sign in with your planner account first.");
    if (!current.outputs.title || !current.outputs.caption)
      return notify("Generate content first.");
    if (
      !confirm(
        "Save this listing and create one draft in the main planner, including its photos? Nothing will be published. Existing planner drafts are never overwritten.",
      )
    )
      return;
    send.disabled = true;
    try {
      const item = snapshotListing();
      const result = await api("/api/listings/" + item.id, {
        method: "PUT",
        body: {
          ...item,
          revision: item.cloudOwner === session.user.id ? item.revision : 0,
        },
      });
      if (current.id === item.id) {
        current.revision = result.revision;
        current.cloudOwner = session.user.id;
      }
      if (db)
        await requestStore("readwrite", (s) =>
          s.put({
            ...item,
            revision: result.revision,
            cloudOwner: session.user.id,
          }),
        );
      const transfer = await api("/api/listings/" + item.id + "/planner", {
        method: "POST",
        body: {},
      });
      notify(
        transfer.existing
          ? "A planner draft already exists for this listing. Open the main planner to edit it; no duplicate was created."
          : "Draft created in the main planner with its media and proposed schedule. Open the main planner to review and approve it.",
      );
    } catch (error) {
      notify(error.message);
    } finally {
      send.disabled = false;
    }
  };
  const library = document.createElement("div");
  library.className = "fields";
  const select = document.createElement("select");
  select.setAttribute("aria-label", "Existing media library photo");
  const load = document.createElement("button");
  load.className = "secondary";
  load.type = "button";
  load.textContent = "Load media library";
  const add = document.createElement("button");
  add.className = "secondary";
  add.type = "button";
  add.textContent = "Add selected photo";
  library.append(load, select, add);
  $("photoList").after(library);
  load.onclick = async () => {
    try {
      const result = await api("/api/vehicle-library");
      select.replaceChildren(
        ...result.media.map((item) => {
          const option = document.createElement("option");
          option.value = item.id;
          option.textContent = item.title || item.id;
          return option;
        }),
      );
      if (!result.media.length)
        notify("No supported photos in the media library.");
    } catch (error) {
      notify(error.message);
    }
  };
  add.onclick = async () => {
    if (!select.value)
      return notify("Load the media library and choose a photo first.");
    if (current.photos.length >= 8) return notify("Maximum eight photos.");
    add.disabled = true;
    try {
      const response = await fetch(
        "/api/media/" + encodeURIComponent(select.value) + "/file",
      );
      if (!response.ok) throw Error("Could not load this private media file.");
      const data = await compressPhoto(await response.blob());
      current.photos.push({
        name: select.selectedOptions[0].textContent,
        data,
        mediaId: select.value,
      });
      renderPhotos();
    } catch (error) {
      notify(error.message);
    } finally {
      add.disabled = false;
    }
  };
}
