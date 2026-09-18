import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
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
});
