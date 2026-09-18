import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { emptyEducation, emptyProfile } from "../src/shared/profile";
import { matchFields } from "../src/shared/matcher";
import { scanDocument } from "../src/shared/scanner";
import { domFromHtml } from "./helpers";

const fixtureNames = [
  "01-native-form.html",
  "02-ant-like-form.html",
  "03-element-like-form.html",
  "04-repeat-education.html",
  "05-repeat-project.html",
  "06-aria-labels.html",
  "07-contenteditable.html",
  "08-native-select.html",
  "09-hidden-disabled-fields.html",
  "10-dynamic-fields.html",
  "11-shadow-dom.html",
  "12-complex-controls.html"
];

describe("fixture integration matrix", () => {
  it.each(fixtureNames)("scans %s with the safety boundary intact", async (fixtureName) => {
    const html = await readFile(new URL(`../test-fixtures/${fixtureName}`, import.meta.url), "utf8");
    const dom = domFromHtml(html, `https://fixture.example.test/${fixtureName}`, "dangerously");
    const fields = scanDocument(dom.window.document, "fixture.example.test");
    expect(fields.every((field) => field.fillCapability !== "unsupported" || ["file", "password", "checkbox", "radio"].includes(field.type) || field.type === "combobox")).toBe(true);
    expect(fields.some((field) => field.type === "file") || fixtureName !== "12-complex-controls.html").toBe(true);
    dom.window.close();
  });

  it("re-scans dynamic fields only when the caller asks", async () => {
    const html = await readFile(new URL("../test-fixtures/10-dynamic-fields.html", import.meta.url), "utf8");
    const dom = domFromHtml(html, "https://fixture.example.test/dynamic", "dangerously");
    expect(scanDocument(dom.window.document, "fixture.example.test")).toHaveLength(1);
    dom.window.document.querySelector<HTMLButtonElement>("#add")?.click();
    expect(scanDocument(dom.window.document, "fixture.example.test")).toHaveLength(2);
    dom.window.close();
  });

  it("fills the golden native and repeat fixtures with the expected values", async () => {
    const profile = emptyProfile();
    profile.basic.fullName = "Alice Example";
    profile.basic.email = "alice@example.com";
    profile.basic.phone = "+86 13800000000";
    profile.basic.currentCity = "示例市";
    profile.basic.address = "示例区示例路 1 号";
    profile.education = [
      { ...emptyEducation(), id: "edu-1", school: "本科示例大学", major: "计算机科学", endDate: "2020-06" },
      { ...emptyEducation(), id: "edu-2", school: "硕士示例大学", major: "软件工程", endDate: "2024-06" },
      { ...emptyEducation(), id: "edu-3", school: "博士示例大学", major: "人工智能", endDate: "2028-06" }
    ];
    const nativeHtml = await readFile(new URL("../test-fixtures/01-native-form.html", import.meta.url), "utf8");
    const nativeDom = domFromHtml(nativeHtml, "https://fixture.example.test/native");
    const nativeFields = scanDocument(nativeDom.window.document, "fixture.example.test");
    const nativePage = matchPage(nativeDom.window.document, nativeFields, profile);
    const nativeReport = executeMatches(nativePage, profile, { overwriteExisting: false, autoOnly: true });
    expect(nativeReport.results.filter((result) => result.status === "FILLED").length).toBe(5);
    expect(nativeDom.window.document.querySelector<HTMLInputElement>("#name")?.value).toBe("Alice Example");
    expect(nativeDom.window.document.querySelector<HTMLInputElement>("#email")?.value).toBe("alice@example.com");
    nativeDom.window.close();

    const repeatHtml = await readFile(new URL("../test-fixtures/04-repeat-education.html", import.meta.url), "utf8");
    const repeatDom = domFromHtml(repeatHtml, "https://fixture.example.test/repeat");
    const repeatFields = scanDocument(repeatDom.window.document, "fixture.example.test");
    expect(matchFields(repeatFields, profile).filter((match) => match.decision === "AUTO").length).toBe(9);
    const repeatPage = matchPage(repeatDom.window.document, repeatFields, profile);
    const repeatReport = executeMatches(repeatPage, profile, { overwriteExisting: false, autoOnly: true });
    expect(repeatReport.results.filter((result) => result.status === "FILLED").length).toBe(9);
    expect(Array.from(repeatDom.window.document.querySelectorAll<HTMLInputElement>("input[name$='.school']")).map((input) => input.value)).toEqual(["本科示例大学", "硕士示例大学", "博士示例大学"]);
    repeatDom.window.close();
  });
});
