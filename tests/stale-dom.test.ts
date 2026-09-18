import { describe, expect, it } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { emptyProfile } from "../src/shared/profile";
import { scanDocument } from "../src/shared/scanner";
import { domFromHtml } from "./helpers";

describe("stale DOM safety", () => {
  it("refuses to fill a detached field reference after a rerender", () => {
    const dom = domFromHtml(`<!doctype html><main id="root"><label>姓名</label><input></main>`);
    const profile = emptyProfile();
    profile.basic.fullName = "Alice Example";
    const fields = scanDocument(dom.window.document, "jobs.example.test");
    const page = matchPage(dom.window.document, fields, profile);
    dom.window.document.querySelector("input")?.remove();
    const report = executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
    expect(report.results[0]?.status).toBe("FAILED");
    expect(report.results[0]?.reason).toContain("脱离文档");
    dom.window.close();
  });
});
