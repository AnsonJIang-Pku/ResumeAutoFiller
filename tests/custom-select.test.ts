import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { emptyEducation, emptyProfile } from "../src/shared/profile";
import { scanDocument } from "../src/shared/scanner";
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
});
