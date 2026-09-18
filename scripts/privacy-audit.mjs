import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const root = join(scriptsDir, "..");
const sourceRoot = join(root, "src");
const forbidden = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /navigator\.sendBeacon/,
  /chrome\.storage\.sync/,
  /\b(?:analytics|telemetry|sentry)\b/i,
  /console\.log\s*\(/
];

const files = [];
async function collect(directory) {
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    const entryStat = await stat(path);
    if (entryStat.isDirectory()) await collect(path);
    else if ([".ts", ".html", ".json"].includes(extname(path))) files.push(path);
  }
}

await collect(sourceRoot);
const violations = [];
for (const file of files) {
  const contents = await readFile(file, "utf8");
  for (const pattern of forbidden) {
    if (pattern.test(contents)) violations.push(`${file}: ${pattern}`);
  }
}

const manifest = JSON.parse(await readFile(join(root, "src/manifest.base.json"), "utf8"));
const permissions = new Set(manifest.permissions ?? []);
const allowed = new Set(["storage", "activeTab", "scripting"]);
for (const permission of permissions) {
  if (!allowed.has(permission)) violations.push(`manifest permission is outside the allowlist: ${permission}`);
}
if (permissions.has("storage") && permissions.has("sync")) {
  violations.push("sync storage is forbidden");
}

if (violations.length > 0) {
  process.stderr.write(`Privacy audit failed:\n${violations.join("\n")}\n`);
  process.exit(1);
}
console.log(`Privacy audit passed: ${files.length} source files inspected; no network, sync storage, telemetry, or console.log usage found.`);
