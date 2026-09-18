import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { chromium, expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const extensionDir = resolve("dist/chrome");

test.describe("loaded MV3 extension UI", () => {
  test.skip(!existsSync(chromePath) || !existsSync(join(extensionDir, "manifest.json")), "requires a local Chrome binary and a built extension");

  test("persists a sample Profile through the real options page and reads it from popup", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "resumeautofiller-e2e-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      executablePath: chromePath,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: ["--no-sandbox", `--disable-extensions-except=${extensionDir}`, `--load-extension=${extensionDir}`]
    });
    try {
      const serviceWorker = context.serviceWorkers()[0];
      if (!serviceWorker) {
        test.skip(true, "This installed Chrome build suppresses extension loading under Playwright automation");
        return;
      }
      const extensionId = new URL(serviceWorker.url()).hostname;
      const options = await context.newPage();
      const extensionRequests: string[] = [];
      options.on("request", (request) => extensionRequests.push(request.url()));
      await options.goto(`chrome-extension://${extensionId}/options.html`);
      await expect(options.getByRole("heading", { name: "Profile 编辑器" })).toBeVisible();
      await options.getByRole("button", { name: "载入虚构示例" }).click();
      await options.getByRole("button", { name: "保存 Profile" }).click();
      await expect(options.locator("#save-status")).toContainText("Profile 已保存");
      await expect(options.locator("[data-basic-key='fullName']")).toHaveValue("Alice Example");

      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      await expect(popup.locator("#profile-status")).toContainText("Profile 已就绪");
      expect(extensionRequests.some((url) => /^https?:/u.test(url))).toBe(false);
    } finally {
      await context.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});
