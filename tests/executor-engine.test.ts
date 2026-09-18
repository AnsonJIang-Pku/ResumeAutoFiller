import { describe, expect, it, vi } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { fillElement, verifyElement } from "../src/shared/executor";
import { emptyProfile } from "../src/shared/profile";
import { mappingForField } from "../src/shared/mapping";
import { scanDocument } from "../src/shared/scanner";
import { domFromHtml } from "./helpers";

describe("DOM executor and verification", () => {
  it("uses the native setter and dispatches input/change/blur events", () => {
    const dom = domFromHtml(`<!doctype html><input id="name">`);
    const input = dom.window.document.querySelector("input");
    if (!input) throw new Error("input missing");
    const events: string[] = [];
    for (const name of ["focus", "input", "change", "blur", "focusout"]) input.addEventListener(name, () => events.push(name));
    fillElement(input, "Alice Example");
    expect(input.value).toBe("Alice Example");
    expect(events).toEqual(["focus", "input", "change", "blur", "focusout"]);
    expect(verifyElement(input, "Alice Example")).toBe(true);
    dom.window.close();
  });

  it("protects existing values unless overwrite is explicit", () => {
    const dom = domFromHtml(`<!doctype html><input value="Existing Example">`);
    const input = dom.window.document.querySelector("input");
    if (!input) throw new Error("input missing");
    expect(() => fillElement(input, "New Example")).toThrow("Existing value is protected");
    fillElement(input, "New Example", true);
    expect(input.value).toBe("New Example");
    dom.window.close();
  });

  it("fills native selects only for a unique exact option", () => {
    const dom = domFromHtml(`<!doctype html><select><option value="">请选择</option><option value="female">女</option><option value="male">男</option></select>`);
    const select = dom.window.document.querySelector("select");
    if (!select) throw new Error("select missing");
    fillElement(select, "女");
    expect(select.value).toBe("female");
    expect(() => fillElement(select, "不存在", true)).toThrow("No exact select option");
    dom.window.close();
  });

  it("fills contenteditable and verifies its text", () => {
    const dom = domFromHtml(`<!doctype html><div contenteditable="true"></div>`);
    const editor = dom.window.document.querySelector("div");
    if (!editor) throw new Error("editor missing");
    fillElement(editor, "示例项目描述");
    expect(editor.textContent).toBe("示例项目描述");
    expect(verifyElement(editor, "示例项目描述")).toBe(true);
    dom.window.close();
  });

  it("normalizes supported month values for native date inputs before verification", () => {
    const dom = domFromHtml(`<!doctype html><input type="date">`);
    const input = dom.window.document.querySelector("input");
    if (!input) throw new Error("date input missing");
    fillElement(input, "2024-06");
    expect(input.value).toBe("2024-06-01");
    expect(verifyElement(input, "2024-06")).toBe(true);
    dom.window.close();
  });

  it("fails closed if a focus handler replaces the control before the setter", () => {
    const dom = domFromHtml(`<!doctype html><input id="field">`);
    const input = dom.window.document.querySelector<HTMLInputElement>("#field");
    if (!input) throw new Error("input missing");
    input.addEventListener("focus", () => {
      const replacement = dom.window.document.createElement("input");
      replacement.id = "field";
      input.replaceWith(replacement);
    }, { once: true });
    expect(() => fillElement(input, "Alice Example")).toThrow("Field changed during focus");
    expect(dom.window.document.querySelector<HTMLInputElement>("#field")?.value).toBe("");
    dom.window.close();
  });
});

describe("fill engine", () => {
  it("returns a readable report and does not fill suggestions automatically", () => {
    const dom = domFromHtml(`<!doctype html><main><label>姓名</label><input><label>自定义问题</label><input></main>`);
    const profile = emptyProfile();
    profile.basic.fullName = "Alice Example";
    const fields = scanDocument(dom.window.document, "jobs.example.test");
    const page = matchPage(dom.window.document, fields, profile);
    const report = executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
    expect(report.results.find((result) => result.label === "姓名")?.status).toBe("FILLED");
    expect(report.results.find((result) => result.label === "自定义问题")?.status).toBe("UNCERTAIN");
    expect((dom.window.document.querySelectorAll("input")[1] as HTMLInputElement).value).toBe("");
    dom.window.close();
  });

  it("cannot use the selected-suggestion path to override an abstained match", () => {
    const dom = domFromHtml(`<!doctype html><label>姓名</label><input>`);
    const profile = emptyProfile();
    profile.basic.fullName = "Alice Example";
    const fields = scanDocument(dom.window.document, "jobs.example.test");
    const page = matchPage(dom.window.document, fields, profile);
    const forcedAbstain = {
      ...page,
      matches: page.matches.map((match) => ({ ...match, decision: "ABSTAIN" as const, reason: "LOW_CONFIDENCE" as const }))
    };
    const report = executeMatches(forcedAbstain, profile, { overwriteExisting: false, selectedFieldIds: new Set(["rf-field-1"]) });
    expect(report.results[0]?.status).toBe("UNCERTAIN");
    expect((dom.window.document.querySelector("input") as HTMLInputElement).value).toBe("");
    dom.window.close();
  });

  it("reuses only an exact hostname and field fingerprint mapping", () => {
    const dom = domFromHtml(`<!doctype html><main><label>最高阶段毕业单位</label><input></main>`);
    const profile = emptyProfile();
    profile.education = [{ id: "edu-1", school: "本科示例大学", schoolEnglish: "", degree: "", major: "", department: "", startDate: "", endDate: "", gpa: "", gpaScale: "", ranking: "", description: "" }];
    const fields = scanDocument(dom.window.document, "jobs.example.test");
    const first = matchPage(dom.window.document, fields, profile);
    expect(first.matches[0]?.decision).toBe("ABSTAIN");
    const field = fields[0];
    if (!field) throw new Error("field missing");
    const mapping = mappingForField(field, "education.edu-1.school", "2026-01-01T00:00:00.000Z");
    const mapped = matchPage(dom.window.document, fields, profile, [mapping]);
    expect(mapped.matches[0]?.decision).toBe("AUTO");
    expect(mapped.matches[0]?.reason).toBe("MAPPED_FIELD");
    dom.window.close();
  });

  it("never stores values in mapping records", () => {
    const dom = domFromHtml(`<!doctype html><label>姓名</label><input>`);
    const field = scanDocument(dom.window.document, "jobs.example.test")[0];
    if (!field) throw new Error("field missing");
    const mapping = mappingForField(field, "basic.fullName");
    expect(JSON.stringify(mapping)).not.toContain("Alice");
    vi.restoreAllMocks();
    dom.window.close();
  });
});
