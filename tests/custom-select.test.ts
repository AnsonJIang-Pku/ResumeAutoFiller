import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { emptyEducation, emptyProfile } from "../src/shared/profile";
import { scanDocument } from "../src/shared/scanner";
import { selectDriverFor } from "../src/shared/select";
import { domFromHtml } from "./helpers";

function selectProfile(school = "虚构大学") {
  const profile = emptyProfile();
  profile.basic.gender = "女";
  profile.education = [{ ...emptyEducation(), id: "edu-1", school, degree: "硕士" }];
  return profile;
}

async function runFixture(name: string, school = "虚构大学") {
  const html = await readFile(new URL(`../test-fixtures/${name}`, import.meta.url), "utf8");
  const dom = domFromHtml(html, `https://select.example.test/${name}`, "dangerously");
  const profile = selectProfile(school);
  const fields = scanDocument(dom.window.document, "select.example.test");
  const page = matchPage(dom.window.document, fields, profile);
  const report = await executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
  return { dom, fields, page, report };
}

describe("custom select drivers", () => {
  it("selects an Ant Design-style option by exact semantic text", async () => {
    const result = await runFixture("13-ant-select.html");
    expect(result.report.results[0]?.status).toBe("FILLED");
    expect(result.dom.window.document.querySelector(".ant-select-selection-placeholder")?.textContent).toBe("硕士");
    result.dom.window.close();
  });

  it("selects an Element-style option by exact semantic text", async () => {
    const result = await runFixture("14-element-select.html");
    expect(result.report.results[0]?.status).toBe("FILLED");
    expect(result.dom.window.document.querySelector<HTMLInputElement>(".el-input input")?.value).toBe("女");
    result.dom.window.close();
  });

  it("handles a portal dropdown mounted under body", async () => {
    const result = await runFixture("15-portal-dropdown.html");
    expect(result.report.results[0]?.status).toBe("FILLED");
    expect(result.dom.window.document.querySelector<HTMLElement>("[role=combobox]")?.textContent).toBe("虚构大学");
    result.dom.window.close();
  });

  it("abstains when normalized options are ambiguous", async () => {
    const result = await runFixture("16-ambiguous-dropdown.html", "北京大学");
    expect(result.report.results[0]?.status).toBe("MANUAL_REQUIRED");
    expect(result.report.results[0]?.reason).toContain("AMBIGUOUS_OPTION");
    expect(result.dom.window.document.querySelector("[data-ambiguous-list]")).not.toBeNull();
    expect(result.dom.window.document.querySelector("[role=combobox]")?.textContent).toBe("请选择");
    result.dom.window.close();
  });

  it("preserves a custom select that already has a non-placeholder visible value", async () => {
    const dom = domFromHtml("<!doctype html><label>学历</label><div role='combobox' aria-label='学历'>硕士</div>");
    const profile = selectProfile();
    const fields = scanDocument(dom.window.document, "select.example.test");
    expect(fields[0]?.currentValue).toBe("硕士");
    const page = matchPage(dom.window.document, fields, profile);
    expect(page.matches[0]?.decision).toBe("EXISTING");
    const report = await executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
    expect(report.results[0]?.status).toBe("SKIPPED");
    expect(dom.window.document.querySelector("[role=combobox]")?.textContent).toBe("硕士");
    dom.window.close();
  });

  it("does not use a globally visible option when multiple unassociated menus exist", async () => {
    const dom = domFromHtml("<!doctype html><div role='combobox' aria-expanded='true'>请选择</div><div><div role='option'>硕士</div></div><div><div role='option'>其他菜单里的硕士</div></div>");
    const control = dom.window.document.querySelector<HTMLElement>("[role=combobox]");
    if (!control) throw new Error("combobox missing");
    const driver = selectDriverFor(control);
    if (!driver) throw new Error("select driver missing");
    const result = await driver.select(control, "硕士");
    expect(result.status).toBe("MANUAL_REQUIRED");
    dom.window.close();
  });

  it("does not click a submit-like element even when it claims role=option", async () => {
    const dom = domFromHtml("<!doctype html><div role='combobox' aria-expanded='true'>请选择</div><div role='listbox'><button type='submit' role='option'>硕士</button></div>");
    const control = dom.window.document.querySelector<HTMLElement>("[role=combobox]");
    if (!control) throw new Error("combobox missing");
    const driver = selectDriverFor(control);
    if (!driver) throw new Error("select driver missing");
    const result = await driver.select(control, "硕士");
    expect(result.status).toBe("MANUAL_REQUIRED");
    dom.window.close();
  });

  it("does not click an image submit control even when it claims role=option", async () => {
    const dom = domFromHtml("<!doctype html><div role='combobox' aria-expanded='true'>请选择</div><div role='listbox'><input type='image' role='option' aria-label='硕士'></div>");
    const control = dom.window.document.querySelector<HTMLElement>("[role=combobox]");
    if (!control) throw new Error("combobox missing");
    const driver = selectDriverFor(control);
    if (!driver) throw new Error("select driver missing");
    const result = await driver.select(control, "硕士");
    expect(result.status).toBe("MANUAL_REQUIRED");
    dom.window.close();
  });

  it("requires a unique visible framework popup when component association is implicit", async () => {
    const dom = domFromHtml("<!doctype html><div class='ant-select' role='combobox' aria-expanded='true'>请选择</div><div class='ant-select-dropdown'><div class='ant-select-item-option' role='option'>硕士</div></div><div class='ant-select-dropdown'><div class='ant-select-item-option' role='option'>博士</div></div>");
    const control = dom.window.document.querySelector<HTMLElement>(".ant-select");
    if (!control) throw new Error("combobox missing");
    const driver = selectDriverFor(control);
    if (!driver) throw new Error("select driver missing");
    const result = await driver.select(control, "硕士");
    expect(result.status).toBe("MANUAL_REQUIRED");
    dom.window.close();
  });
});
