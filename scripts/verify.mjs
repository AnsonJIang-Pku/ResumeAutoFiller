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

const check = run(pnpm, ["check"]);
if (check.status !== 0) {
  process.stdout.write("CHECK_STATUS=FAIL\nE2E_STATUS=SKIPPED\nVERIFY_STATUS=FAIL\n");
  process.exit(1);
}
process.stdout.write("CHECK_STATUS=PASS\n");

const e2e = run(process.execPath, [join(scriptsDir, "e2e-gate.mjs")]);
if (e2e.status === 2) {
  process.stdout.write("VERIFY_STATUS=SKIPPED\n");
  process.exit(2);
}
if (e2e.status !== 0) {
  process.stdout.write("VERIFY_STATUS=FAIL\n");
  process.exit(1);
}
process.stdout.write("VERIFY_STATUS=PASS\n");
