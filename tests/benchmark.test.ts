import { describe, expect, it } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { emptyEducation, emptyProfile } from "../src/shared/profile";
import { scanDocument } from "../src/shared/scanner";
import { domFromHtml } from "./helpers";

describe("golden benchmark", () => {
  it("reports precision, standard coverage and repeat identity alignment", () => {
    const dom = domFromHtml(`<!doctype html><main><h1>基本信息</h1><label>姓名</label><input><label>邮箱</label><input type="email"><label>手机号</label><input type="tel"><fieldset><legend>教育经历</legend><label>学校</label><input><label>专业</label><input></fieldset><fieldset><legend>教育经历</legend><label>学校</label><input><label>专业</label><input></fieldset></main>`);
    const profile = emptyProfile();
    profile.basic.fullName = "Alice Example";
    profile.basic.email = "alice@example.com";
    profile.basic.phone = "+86 13800000000";
    profile.education = [
      { ...emptyEducation(), id: "edu-1", school: "本科示例大学", major: "计算机科学" },
      { ...emptyEducation(), id: "edu-2", school: "硕士示例大学", major: "软件工程" }
    ];
    const page = matchPage(dom.window.document, scanDocument(dom.window.document, "benchmark.example.test"), profile);
    const report = executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
    const automatic = page.matches.filter((match) => match.decision === "AUTO");
    const filled = report.results.filter((result) => result.status === "FILLED");
    const precision = automatic.length === 0 ? 1 : filled.length / automatic.length;
    const eligible = 7;
    const coverage = filled.length / eligible;
    const repeatMatches = page.matches.filter((match) => match.candidate?.canonicalKey === "education.school");
    const repeatAligned = repeatMatches.every((match, index) => match.candidate?.profileKey === `education.edu-${index + 1}.school`);
    expect(precision).toBe(1);
    expect(coverage).toBe(1);
    expect(repeatAligned).toBe(true);
    process.stdout.write(`BENCHMARK precision=${(precision * 100).toFixed(1)}% coverage=${(coverage * 100).toFixed(1)}% repeat_identity=${repeatAligned ? "100.0" : "0.0"}%\n`);
    dom.window.close();
  });
});
