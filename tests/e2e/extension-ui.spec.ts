import { existsSync } from "node:fs";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { chromium, expect, test } from "@playwright/test";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const extensionDir = resolve("dist/chrome");
const bundledChromiumPath = chromium.executablePath();
const testBrowserPath = existsSync(bundledChromiumPath) ? bundledChromiumPath : chromePath;

async function startFixtureServer(): Promise<{ url: string; close: () => Promise<void> }> {
  const fixture = await readFile(resolve("test-fixtures/13-ant-select.html"), "utf8");
  const server = createServer((_request, response) => {
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(fixture);
  });
  await new Promise<void>((resolveServer, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolveServer());
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture server did not bind to a TCP port");
  return {
    url: `http://127.0.0.1:${address.port}/13-ant-select.html`,
    close: async () => await new Promise<void>((resolveServer, reject) => server.close((error) => error ? reject(error) : resolveServer()))
  };
}

async function createHeadlessFlowExtension(): Promise<{ directory: string; close: () => Promise<void> }> {
  const directory = await mkdtemp(join(tmpdir(), "resumeautofiller-test-extension-"));
  await cp(extensionDir, directory, { recursive: true });
  const manifestPath = join(directory, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8")) as Record<string, unknown>;
  // The production package has no host permission. This ephemeral test copy
  // uses a loopback-only permission because headless Playwright cannot create
  // the browser toolbar gesture that grants activeTab to a real popup.
  manifest.host_permissions = ["http://127.0.0.1/*"];
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return { directory, close: async () => await rm(directory, { recursive: true, force: true }) };
}

test.describe("loaded MV3 extension UI", () => {
  test.skip(!existsSync(testBrowserPath) || !existsSync(join(extensionDir, "manifest.json")), "requires a local Chromium/Chrome binary and a built extension");

  test("persists a sample Profile through the real options page and reads it from popup", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "resumeautofiller-e2e-"));
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      executablePath: testBrowserPath,
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

  test("runs the real options → fixture tab → popup scan/fill flow", async () => {
    const userDataDir = await mkdtemp(join(tmpdir(), "resumeautofiller-e2e-flow-"));
    const fixtureServer = await startFixtureServer();
    const testExtension = await createHeadlessFlowExtension();
    const context = await chromium.launchPersistentContext(userDataDir, {
      headless: true,
      executablePath: testBrowserPath,
      ignoreDefaultArgs: ["--disable-extensions"],
      args: ["--no-sandbox", `--disable-extensions-except=${testExtension.directory}`, `--load-extension=${testExtension.directory}`]
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
      await options.getByRole("button", { name: "载入虚构示例" }).click();
      await options.getByRole("button", { name: "保存 Profile" }).click();
      await expect(options.locator("#save-status")).toContainText("Profile 已保存");

      const fixture = await context.newPage();
      const fixtureUrl = fixtureServer.url;
      await fixture.goto(fixtureUrl);
      await expect(fixture.locator("[role=combobox]")).toBeVisible();

      await fixture.bringToFront();
      await serviceWorker.evaluate((fixtureUrl) => {
        const tabs = chrome.tabs as unknown as { query: (query: Record<string, unknown>) => Promise<Array<{ url?: string }>> };
        const originalQuery = tabs.query.bind(tabs);
        tabs.query = async (query) => {
          if (query.active) {
            const allTabs = await originalQuery({});
            const fixtureTab = allTabs.find((tab) => tab.url === fixtureUrl);
            if (fixtureTab) return [fixtureTab];
          }
          return originalQuery(query);
        };
      }, fixtureUrl);
      const popup = await context.newPage();
      await popup.goto(`chrome-extension://${extensionId}/popup.html`);
      popup.on("request", (request) => extensionRequests.push(request.url()));
      await popup.locator("#scan-page").click();
      await expect(popup.locator("#status")).toContainText("扫描完成");
      await popup.locator("#fill-high").click();
      await expect(popup.locator("#status")).toContainText("填写完成");
      await expect(fixture.locator(".ant-select-selection-placeholder")).toHaveText("硕士");
      expect(extensionRequests.filter((url) => /^(?:https?|wss?):/u.test(url))).toEqual([]);
    } finally {
      await context.close();
      await testExtension.close();
      await fixtureServer.close();
      await rm(userDataDir, { recursive: true, force: true });
    }
  });
});
