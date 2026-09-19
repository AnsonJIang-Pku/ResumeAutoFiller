import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(scriptsDir, "..");
const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

function run(command, args) {
  const result = spawnSync(command, args, { cwd: projectRoot, encoding: "utf8" });
  if (result.stdout) process.stdout.write(result.stdout);
  if (result.stderr) process.stderr.write(result.stderr);
  return result;
}

const build = run(pnpm, ["build"]);
if (build.status !== 0) {
  process.stdout.write("E2E_STATUS=FAIL\n");
  process.exit(1);
}

const result = spawnSync(pnpm, ["exec", "playwright", "test", "--reporter=json"], { cwd: projectRoot, encoding: "utf8" });
if (result.stderr) process.stderr.write(result.stderr);
const output = result.stdout ?? "";
const start = output.indexOf("{");
const end = output.lastIndexOf("}");
let report;
try {
  if (start < 0 || end < start) throw new Error("Playwright JSON reporter returned no JSON object");
  report = JSON.parse(output.slice(start, end + 1));
} catch (error) {
  process.stderr.write(`Unable to parse Playwright JSON report: ${error instanceof Error ? error.message : "unknown error"}\n`);
  process.stdout.write("E2E_STATUS=FAIL\n");
  process.exit(1);
}

const stats = report.stats ?? {};
const skipped = Number(stats.skipped ?? 0);
const unexpected = Number(stats.unexpected ?? 0);
const expected = Number(stats.expected ?? 0);
process.stdout.write(`E2E_REPORT expected=${expected} skipped=${skipped} unexpected=${unexpected}\n`);
if (result.status !== 0 || unexpected > 0) {
  process.stdout.write("E2E_STATUS=FAIL\n");
  process.exit(1);
}
if (skipped > 0 || expected === 0) {
  process.stdout.write("E2E_STATUS=SKIPPED\n");
  process.exit(2);
}
process.stdout.write("E2E_STATUS=PASS\n");
