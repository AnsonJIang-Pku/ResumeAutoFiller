import { build } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");
const distRoot = join(projectRoot, "dist");

const manifest = (browser) => ({
  manifest_version: 3,
  name: "ResumeAutoFiller",
  version: "0.1.0",
  description: "本地优先、只在用户主动操作时运行的网申资料填写工具。",
  permissions: ["storage", "activeTab", "scripting"],
  action: {
    default_title: "打开 ResumeAutoFiller",
    default_popup: "popup.html"
  },
  background: {
    service_worker: "background.js",
    type: "module"
  },
  options_page: "options.html",
  ...(browser === "edge" ? { minimum_chrome_version: "111" } : {})
});

await rm(distRoot, { recursive: true, force: true });

for (const browser of ["chrome", "edge"]) {
  const outDir = join(distRoot, browser);
  await mkdir(outDir, { recursive: true });
  await Promise.all([
    build({
      entryPoints: [join(projectRoot, "src/background/main.ts")],
      outfile: join(outDir, "background.js"),
      bundle: true,
      format: "esm",
      platform: "browser",
      target: "es2022",
      sourcemap: false,
      logLevel: "warning"
    }),
    build({
      entryPoints: [join(projectRoot, "src/content/main.ts")],
      outfile: join(outDir, "content.js"),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      sourcemap: false,
      logLevel: "warning"
    }),
    build({
      entryPoints: [join(projectRoot, "src/popup/main.ts")],
      outfile: join(outDir, "popup.js"),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      sourcemap: false,
      logLevel: "warning"
    }),
    build({
      entryPoints: [join(projectRoot, "src/options/main.ts")],
      outfile: join(outDir, "options.js"),
      bundle: true,
      format: "iife",
      platform: "browser",
      target: "es2022",
      sourcemap: false,
      logLevel: "warning"
    })
  ]);

  await Promise.all([
    writeFile(join(outDir, "manifest.json"), `${JSON.stringify(manifest(browser), null, 2)}\n`),
    cp(join(projectRoot, "src/popup/popup.html"), join(outDir, "popup.html")),
    cp(join(projectRoot, "src/options/options.html"), join(outDir, "options.html")),
    cp(join(projectRoot, "src/popup/popup.css"), join(outDir, "popup.css")),
    cp(join(projectRoot, "src/options/options.css"), join(outDir, "options.css"))
  ]);
}

const fixtureDir = join(projectRoot, "test-fixtures");
const fixtureOut = join(distRoot, "fixtures");
await mkdir(fixtureOut, { recursive: true });
const fixtureFiles = (await readFile(join(projectRoot, "scripts/fixture-list.txt"), "utf8"))
  .split("\n")
  .map((line) => line.trim())
  .filter(Boolean);
await Promise.all(fixtureFiles.map((file) => cp(join(fixtureDir, file), join(fixtureOut, file))));

console.log(`Built Chrome and Edge packages in ${distRoot}`);
