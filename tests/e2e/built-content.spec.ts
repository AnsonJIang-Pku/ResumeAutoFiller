import { existsSync } from "node:fs";
import { chromium, test, expect } from "@playwright/test";
import { resolve } from "node:path";

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const contentBundle = resolve("dist/chrome/content.js");

const profile = {
  version: 1,
  basic: {
    fullName: "Alice Example",
    englishName: "Alice Example",
    gender: "女",
    birthDate: "2000-01-15",
    phone: "+86 13800000000",
    email: "alice@example.com",
    currentCity: "示例市",
    address: "示例区示例路 1 号",
    nationality: "中国",
    politicalStatus: "群众",
    identityNumber: ""
  },
  education: [],
  projects: [],
  research: [],
  awards: [],
  languages: [],
  skills: [],
  customFields: []
};

test.describe("built content script in Chromium", () => {
  test.skip(!existsSync(chromePath) || !existsSync(contentBundle), "requires a local Chrome binary and a built extension");

  test("scans and fills a native fixture through the message boundary", async () => {
    const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><main><h1>基本信息</h1><label for="name">姓名</label><input id="name"><label for="email">邮箱</label><input id="email" type="email"><button type="submit">提交</button></main>`);
    await page.addInitScript({ content: `window.chrome={runtime:{onMessage:{addListener:function(listener){window.__rafMessage=listener;}}}};` });
    await page.reload();
    await page.setContent(`<!doctype html><main><h1>基本信息</h1><label for="name">姓名</label><input id="name"><label for="email">邮箱</label><input id="email" type="email"><button type="submit">提交</button></main>`);
    await page.addScriptTag({ path: contentBundle });
    const scan = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "SCAN_PAGE", profile: currentProfile, mappings: [] }, {}, (response) => resolve(response as Record<string, unknown>));
    }), profile);
    expect(scan.ok).toBe(true);
    expect(scan.scanned).toBe(2);
    expect(scan.autoCandidates).toBe(2);
    const fill = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "FILL_HIGH_CONFIDENCE", profile: currentProfile, overwriteExisting: false }, {}, (response) => resolve(response as Record<string, unknown>));
    }), profile);
    expect(fill.ok).toBe(true);
    expect(await page.locator("#name").inputValue()).toBe("Alice Example");
    expect(await page.locator("#email").inputValue()).toBe("alice@example.com");
    await browser.close();
  });
});
