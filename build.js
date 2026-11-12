import { mkdir, copyFile, cp, rm, readFile, writeFile } from "node:fs/promises";
await rm("dist", { recursive: true, force: true });
await mkdir("dist");
for (const file of ["index.html", "style.css", "_headers", "_routes.json"])
  await copyFile(file, `dist/${file}`);
await cp("src", "dist/src", { recursive: true });
console.log("Cloudflare Pages output: dist");

await writeFile(
  "dist/_worker.js",
  (await readFile("server/worker.js", "utf8")).replace(
    "../src/engine.js",
    "./src/engine.js",
  ),
);
