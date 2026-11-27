// Copies CesiumJS's ready-made browser build into public/cesium/ so the 3D view can load it on demand
// (issue #26). Runs after npm install and before dev/build; skips the copy when the version already matches.
// public/cesium/ is git-ignored.

import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const web = join(dirname(fileURLToPath(import.meta.url)), "..");
const pkg = join(web, "node_modules", "cesium", "package.json");
if (!existsSync(pkg)) {
  console.log("copy-cesium: cesium is not installed yet, skipping.");
  process.exit(0);
}
const version = JSON.parse(readFileSync(pkg, "utf8")).version;
const src = join(web, "node_modules", "cesium", "Build", "Cesium");
const dest = join(web, "public", "cesium");
const marker = join(dest, "VERSION");

if (existsSync(marker) && readFileSync(marker, "utf8").trim() === version) {
  console.log(`copy-cesium: CesiumJS ${version} already in public/cesium.`);
  process.exit(0);
}
rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
for (const item of ["Cesium.js", "Workers", "Assets", "ThirdParty", "Widgets"]) cpSync(join(src, item), join(dest, item), { recursive: true });
writeFileSync(marker, `${version}\n`);
console.log(`copy-cesium: copied CesiumJS ${version} to public/cesium.`);
