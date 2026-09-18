import { describe, expect, it } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { emptyProfile } from "../src/shared/profile";
import { scanDocument } from "../src/shared/scanner";
import { domFromHtml } from "./helpers";

describe("live field revalidation", () => {
  it("rejects a field whose label was repurposed after scan", () => {
    const dom = domFromHtml(`<!doctype html><label for="field">姓名</label><input id="field">`);
    const profile = emptyProfile();
    profile.basic.fullName = "Alice Example";
    const page = matchPage(dom.window.document, scanDocument(dom.window.document, "jobs.example.test"), profile);
    dom.window.document.querySelector("label")!.textContent = "邮箱";
    const report = executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
    expect(report.results[0]?.status).toBe("FAILED");
    expect(report.results[0]?.reason).toContain("属性已变化");
    dom.window.close();
  });

  it("rejects a connected field whose label changes during its input event", () => {
    const dom = domFromHtml(`<!doctype html><label for="field">姓名</label><input id="field">`);
    const profile = emptyProfile();
    profile.basic.fullName = "Alice Example";
    dom.window.document.querySelector<HTMLInputElement>("#field")?.addEventListener("input", () => {
      dom.window.document.querySelector("label")!.textContent = "邮箱";
    }, { once: true });
    const page = matchPage(dom.window.document, scanDocument(dom.window.document, "jobs.example.test"), profile);
    const report = executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
    expect(report.results[0]?.status).toBe("FAILED");
    expect(report.results[0]?.reason).toContain("字段语义");
    dom.window.close();
  });

  it("invalidates an earlier success when a later field event repurposes it", () => {
    const dom = domFromHtml(`<!doctype html><main><label for="first">姓名</label><input id="first"><label for="second">邮箱</label><input id="second" type="email"></main>`);
    const profile = emptyProfile();
    profile.basic.fullName = "Alice Example";
    profile.basic.email = "alice@example.com";
    dom.window.document.querySelector<HTMLInputElement>("#second")?.addEventListener("input", () => {
      dom.window.document.querySelector("label[for='first']")!.textContent = "邮箱";
    }, { once: true });
    const page = matchPage(dom.window.document, scanDocument(dom.window.document, "jobs.example.test"), profile);
    const report = executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
    expect(report.results[0]?.status).toBe("FAILED");
    expect(report.results[0]?.reason).toContain("已恢复原值");
    expect(dom.window.document.querySelector<HTMLInputElement>("#first")?.value).toBe("");
    dom.window.close();
  });
});
