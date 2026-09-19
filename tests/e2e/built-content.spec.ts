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
    const pageRequests: string[] = [];
    page.on("request", (request) => pageRequests.push(request.url()));
    await page.setContent(`<!doctype html><main><h1>基本信息</h1><label for="name">姓名</label><input id="name"><label for="email">邮箱</label><input id="email" type="email"><button type="submit">提交</button></main>`);
    await page.addInitScript({ content: `window.chrome={runtime:{onMessage:{addListener:function(listener){window.__rafMessage=listener;}}}};` });
    await page.reload();
    await page.setContent(`<!doctype html><main><h1>基本信息</h1><label for="name">姓名</label><input id="name"><label for="email">邮箱</label><input id="email" type="email"><button type="submit">提交</button></main>`);
    await page.addScriptTag({ path: contentBundle });
    const scan = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "SCAN_PAGE", profile: currentProfile, mappings: [] }, {}, (response) => resolve(structuredClone(response) as Record<string, unknown>));
    }), profile);
    expect(scan.ok).toBe(true);
    expect(scan.scanned).toBe(2);
    expect(scan.autoCandidates).toBe(2);
    const staleConfirmation = await page.evaluate(({ currentProfile, staleSessionId }) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "SCAN_PAGE", profile: currentProfile, mappings: [] }, {}, () => {
        listener({ type: "FILL_SELECTED_SUGGESTION", profile: currentProfile, fieldId: "rf-field-1", sessionId: staleSessionId, overwriteExisting: false }, {}, (response) => resolve(structuredClone(response) as Record<string, unknown>));
      });
    }), { currentProfile: profile, staleSessionId: String(scan.sessionId) });
    expect(staleConfirmation.ok).toBe(false);
    const fill = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "FILL_HIGH_CONFIDENCE", profile: currentProfile, overwriteExisting: false }, {}, (response) => resolve(structuredClone(response) as Record<string, unknown>));
    }), profile);
    expect(fill.ok).toBe(true);
    expect(await page.locator("#name").inputValue()).toBe("Alice Example");
    expect(await page.locator("#email").inputValue()).toBe("alice@example.com");
    const repeatFill = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "FILL_HIGH_CONFIDENCE", profile: currentProfile, overwriteExisting: true }, {}, (response) => resolve(structuredClone(response) as Record<string, unknown>));
    }), profile);
    expect(repeatFill.ok).toBe(true);
    expect(pageRequests.filter((url) => /^(?:https?|wss?):/u.test(url))).toEqual([]);
    await browser.close();
  });

  test("rejects a stale session after dynamic and custom-select changes", async () => {
    const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><main><h1>基本信息</h1><label for="name">姓名</label><input id="name"><button id="add" type="button">增加字段</button><label for="degree">学历</label><div id="degree" role="combobox" aria-label="学历" aria-expanded="false">请选择</div></main><script>document.querySelector('#add').addEventListener('click',()=>{const label=document.createElement('label');label.htmlFor='email';label.textContent='邮箱';const input=document.createElement('input');input.id='email';input.type='email';document.querySelector('main').append(label,input);});</script>`);
    await page.addInitScript({ content: `window.chrome={runtime:{onMessage:{addListener:function(listener){window.__rafMessage=listener;}}}};` });
    await page.reload();
    await page.setContent(`<!doctype html><main><h1>基本信息</h1><label for="name">姓名</label><input id="name"><button id="add" type="button">增加字段</button><label for="degree">学历</label><div id="degree" role="combobox" aria-label="学历" aria-expanded="false">请选择</div></main><script>document.querySelector('#add').addEventListener('click',()=>{const label=document.createElement('label');label.htmlFor='email';label.textContent='邮箱';const input=document.createElement('input');input.id='email';input.type='email';document.querySelector('main').append(label,input);});</script>`);
    await page.addScriptTag({ path: contentBundle });
    const scan = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "SCAN_PAGE", profile: currentProfile, mappings: [] }, {}, (response) => resolve(structuredClone(response) as Record<string, unknown>));
    }), profile);
    expect(scan.ok).toBe(true);
    await page.locator("#add").click();
    await page.waitForTimeout(20);
    const stale = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "FILL_HIGH_CONFIDENCE", profile: currentProfile, overwriteExisting: false }, {}, (response) => resolve(structuredClone(response) as Record<string, unknown>));
    }), profile);
    expect(stale.ok).toBe(false);
    expect(String(stale.error)).toContain("SESSION_STALE");
    const rescanned = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "SCAN_PAGE", profile: currentProfile, mappings: [] }, {}, (response) => resolve(structuredClone(response) as Record<string, unknown>));
    }), profile);
    expect(rescanned.scanned).toBe(3);
    await browser.close();
  });

  test("rejects a session when a custom select change adds another field", async () => {
    const browser = await chromium.launch({ headless: true, executablePath: chromePath, args: ["--no-sandbox"] });
    const page = await browser.newPage();
    await page.setContent(`<!doctype html><main><h1>教育经历</h1><label for="degree">学历</label><div id="degree" role="combobox" aria-label="学历" aria-expanded="false">请选择</div></main><script>const control=document.querySelector('#degree');control.addEventListener('click',()=>{if(document.querySelector('[role=listbox]'))return;const menu=document.createElement('div');menu.setAttribute('role','listbox');const option=document.createElement('div');option.setAttribute('role','option');option.textContent='硕士';option.addEventListener('click',()=>{control.textContent='硕士';const label=document.createElement('label');label.textContent='专业';const input=document.createElement('input');document.querySelector('main').append(label,input);menu.remove();});menu.append(option);document.body.append(menu);});</script>`);
    await page.addInitScript({ content: `window.chrome={runtime:{onMessage:{addListener:function(listener){window.__rafMessage=listener;}}}};` });
    await page.reload();
    await page.setContent(`<!doctype html><main><h1>教育经历</h1><label for="degree">学历</label><div id="degree" role="combobox" aria-label="学历" aria-expanded="false">请选择</div></main><script>const control=document.querySelector('#degree');control.addEventListener('click',()=>{if(document.querySelector('[role=listbox]'))return;const menu=document.createElement('div');menu.setAttribute('role','listbox');const option=document.createElement('div');option.setAttribute('role','option');option.textContent='硕士';option.addEventListener('click',()=>{control.textContent='硕士';const label=document.createElement('label');label.textContent='专业';const input=document.createElement('input');document.querySelector('main').append(label,input);menu.remove();});menu.append(option);document.body.append(menu);});</script>`);
    await page.addScriptTag({ path: contentBundle });
    const customProfile = { ...profile, education: [{ id: "edu-1", school: "虚构大学", schoolEnglish: "", degree: "硕士", major: "计算机科学", department: "", startDate: "", endDate: "", gpa: "", gpaScale: "", ranking: "", description: "" }] };
    const scan = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "SCAN_PAGE", profile: currentProfile, mappings: [] }, {}, (response) => resolve(structuredClone(response) as Record<string, unknown>));
    }), customProfile);
    expect(scan.ok).toBe(true);
    await page.locator("#degree").click();
    await page.getByRole("option", { name: "硕士" }).click();
    await page.waitForTimeout(20);
    const stale = await page.evaluate((currentProfile) => new Promise<Record<string, unknown>>((resolve) => {
      const listener = (window as Window & { __rafMessage?: (message: unknown, sender: unknown, callback: (response: unknown) => void) => void }).__rafMessage;
      if (!listener) throw new Error("content listener was not installed");
      listener({ type: "FILL_HIGH_CONFIDENCE", profile: currentProfile, overwriteExisting: false }, {}, (response) => resolve(structuredClone(response) as Record<string, unknown>));
    }), customProfile);
    expect(stale.ok).toBe(false);
    expect(String(stale.error)).toContain("SESSION_STALE");
    await browser.close();
  });
});
