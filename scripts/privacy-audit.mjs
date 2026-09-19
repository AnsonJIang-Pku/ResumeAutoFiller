import { access, readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = fileURLToPath(new URL(".", import.meta.url));
const root = join(scriptsDir, "..");
const forbidden = [
  /\bfetch\s*\(/,
  /\bXMLHttpRequest\b/,
  /\bWebSocket\b/,
  /\bEventSource\b/,
  /navigator\.sendBeacon/,
  /chrome\.storage\.sync/,
  /\b(?:analytics|telemetry|sentry)\b/i,
  /console\.log\s*\(/,
  /\b(?:https?|wss?):\/\//
];

const files = [];
async function collect(directory, extensions) {
  for (const entry of await readdir(directory)) {
    const path = join(directory, entry);
    const entryStat = await stat(path);
    if (entryStat.isDirectory()) await collect(path, extensions);
    else if (extensions.includes(extname(path))) files.push(path);
  }
}

await collect(join(root, "src"), [".ts", ".html", ".css", ".json"]);
try {
  await access(join(root, "dist"));
  await collect(join(root, "dist"), [".js", ".html", ".css", ".json"]);
} catch {
  // A source-only audit is still useful before the first build.
}
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

function auditManifestShape(candidate, label) {
  for (const key of ["host_permissions", "optional_host_permissions", "externally_connectable"]) {
    if (Object.prototype.hasOwnProperty.call(candidate, key)) violations.push(`${label} manifest must not declare ${key}`);
  }
  const policy = JSON.stringify(candidate.content_security_policy ?? "");
  if (/\b(?:https?|wss?):\/\//u.test(policy)) violations.push(`${label} manifest CSP contains a remote origin`);
  for (const resourceGroup of candidate.web_accessible_resources ?? []) {
    for (const match of resourceGroup.matches ?? []) {
      if (/\b(?:https?|wss?):\/\//u.test(match)) violations.push(`${label} web_accessible_resources exposes a remote match: ${match}`);
    }
  }
}

auditManifestShape(manifest, "source");

for (const builtBrowser of ["chrome", "edge"]) {
  try {
    const builtManifest = JSON.parse(await readFile(join(root, "dist", builtBrowser, "manifest.json"), "utf8"));
    const builtPermissions = new Set(builtManifest.permissions ?? []);
    for (const permission of builtPermissions) if (!allowed.has(permission)) violations.push(`built ${builtBrowser} manifest permission is outside the allowlist: ${permission}`);
    auditManifestShape(builtManifest, `built ${builtBrowser}`);
  } catch {
    // The generated manifest is checked when dist exists; source checks remain valid before build.
  }
}

if (violations.length > 0) {
  process.stderr.write(`Privacy audit failed:\n${violations.join("\n")}\n`);
  process.exit(1);
}
console.log(`Privacy audit passed: ${files.length} source files inspected; no network, sync storage, telemetry, remote manifest access, or console.log usage found.`);
