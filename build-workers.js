import { cp, readFile, writeFile } from "node:fs/promises";
const root = "workers-studio/public";
await cp("src", root + "/vehicles/src", { recursive: true });
await cp("style.css", root + "/vehicles/style.css");
await cp("index.html", root + "/vehicles/index.html");
const index = await readFile(root + "/index.html", "utf8");
if (!index.includes("/vehicle-entry.js"))
  await writeFile(
    root + "/index.html",
    index.replace(
      "</head>",
      '<script type="module" src="/vehicle-entry.js"></script><link rel="stylesheet" href="/vehicle-entry.css"></head>',
    ),
  );
console.log(
  "Existing planner assets preserved; vehicle workspace prepared at /vehicles/",
);
