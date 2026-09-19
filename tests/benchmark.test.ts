import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { emptyAward, emptyEducation, emptyLanguage, emptyProfile, emptyProject, emptyResearch, emptySkill } from "../src/shared/profile";
import { scanDocument } from "../src/shared/scanner";
import type { ResumeProfile } from "../src/shared/types";
import { domFromHtml } from "./helpers";

interface GoldenCase {
  fixture: string;
  category: "standard" | "custom-select" | "repeat" | "negative" | "dynamic-shadow";
  expectedProfileKeys: string[];
}

const GOLDEN_CASES: GoldenCase[] = [
  { fixture: "01-native-form.html", category: "standard", expectedProfileKeys: ["basic.fullName", "basic.email", "basic.phone", "basic.currentCity", "basic.address"] },
  { fixture: "02-ant-like-form.html", category: "standard", expectedProfileKeys: ["basic.fullName", "basic.email", "education.edu-1.school"] },
  { fixture: "03-element-like-form.html", category: "standard", expectedProfileKeys: ["basic.phone", "basic.email"] },
  { fixture: "04-repeat-education.html", category: "repeat", expectedProfileKeys: ["education.edu-1.school", "education.edu-1.major", "education.edu-1.endDate", "education.edu-2.school", "education.edu-2.major", "education.edu-2.endDate", "education.edu-3.school", "education.edu-3.major", "education.edu-3.endDate"] },
  { fixture: "05-repeat-project.html", category: "repeat", expectedProfileKeys: ["projects.project-1.name", "projects.project-1.role", "projects.project-1.description", "projects.project-2.name", "projects.project-2.role", "projects.project-2.description", "projects.project-3.name", "projects.project-3.role", "projects.project-3.description"] },
  { fixture: "06-aria-labels.html", category: "standard", expectedProfileKeys: ["basic.email", "basic.phone", "basic.fullName", "basic.currentCity", "basic.nationality"] },
  { fixture: "07-contenteditable.html", category: "standard", expectedProfileKeys: ["projects.project-1.name", "projects.project-1.description"] },
  { fixture: "08-native-select.html", category: "standard", expectedProfileKeys: ["basic.gender"] },
  { fixture: "09-hidden-disabled-fields.html", category: "negative", expectedProfileKeys: [] },
  { fixture: "10-dynamic-fields.html", category: "dynamic-shadow", expectedProfileKeys: ["education.edu-1.school"] },
  { fixture: "11-shadow-dom.html", category: "dynamic-shadow", expectedProfileKeys: ["basic.phone"] },
  { fixture: "12-complex-controls.html", category: "negative", expectedProfileKeys: ["basic.birthDate"] },
  { fixture: "13-ant-select.html", category: "custom-select", expectedProfileKeys: ["education.edu-1.degree"] },
  { fixture: "14-element-select.html", category: "custom-select", expectedProfileKeys: ["basic.gender"] },
  { fixture: "15-portal-dropdown.html", category: "custom-select", expectedProfileKeys: ["education.edu-1.school"] },
  { fixture: "16-ambiguous-dropdown.html", category: "custom-select", expectedProfileKeys: [] },
  { fixture: "17-repeat-research.html", category: "repeat", expectedProfileKeys: ["research.research-1.name", "research.research-2.name"] },
  { fixture: "18-suggestion-correction.html", category: "negative", expectedProfileKeys: [] }
];

function goldenProfile(): ResumeProfile {
  const profile = emptyProfile();
  profile.basic = {
    ...profile.basic,
    fullName: "Alice Example",
    englishName: "Alice Example",
    gender: "女",
    birthDate: "2000-01-15",
    phone: "+86 13800000000",
    email: "alice@example.com",
    currentCity: "示例市",
    address: "示例区示例路 1 号",
    nationality: "中国",
    politicalStatus: "群众"
  };
  profile.education = [
    { ...emptyEducation(), id: "edu-1", school: "本科示例大学", degree: "硕士", major: "计算机科学", endDate: "2020-06" },
    { ...emptyEducation(), id: "edu-2", school: "硕士示例大学", degree: "硕士", major: "软件工程", endDate: "2024-06" },
    { ...emptyEducation(), id: "edu-3", school: "博士示例大学", degree: "博士", major: "人工智能", endDate: "2028-06" }
  ];
  profile.projects = [
    { ...emptyProject(), id: "project-1", name: "示例数据平台", role: "开发者", description: "第一个虚构项目描述。" },
    { ...emptyProject(), id: "project-2", name: "示例搜索系统", role: "负责人", description: "第二个虚构项目描述。" },
    { ...emptyProject(), id: "project-3", name: "示例可视化工具", role: "开发者", description: "第三个虚构项目描述。" }
  ];
  profile.research = [{ ...emptyResearch(), id: "research-1", name: "示例研究一" }, { ...emptyResearch(), id: "research-2", name: "示例研究二" }];
  profile.awards = [{ ...emptyAward(), id: "award-1", name: "示例奖项" }];
  profile.languages = [{ ...emptyLanguage(), id: "language-1", name: "英语", level: "熟练", score: "示例成绩" }];
  profile.skills = [{ ...emptySkill(), id: "skill-1", name: "TypeScript", level: "熟练", description: "示例技能" }];
  profile.customFields = [{ id: "custom-school", label: "申请学校", value: "虚构大学" }];
  return profile;
}

describe("golden benchmark", () => {
  it("measures precision and coverage across every committed fixture with explicit negative ground truth", async () => {
    const profile = goldenProfile();
    let eligible = 0;
    let correct = 0;
    let autoAttempts = 0;
    let autoFilled = 0;
    let negativeAutoMatches = 0;
    let repeatCorrect = 0;
    let repeatEligible = 0;
    let totalScanned = 0;
    let suggestCount = 0;
    let manualCount = 0;
    let abstainCount = 0;
    let unsupportedCount = 0;
    let seriousWrongAutofill = 0;
    const categoryStats = new Map<string, { scanned: number; eligible: number; auto: number; correct: number }>();

    for (const golden of GOLDEN_CASES) {
      const html = await readFile(new URL(`../test-fixtures/${golden.fixture}`, import.meta.url), "utf8");
      const runsScripts = golden.fixture === "10-dynamic-fields.html" || golden.fixture === "11-shadow-dom.html" || golden.fixture.startsWith("1") && golden.fixture !== "12-complex-controls.html" ? "dangerously" : undefined;
      const dom = domFromHtml(html, `https://benchmark.example.test/${golden.fixture}`, runsScripts);
      const fields = scanDocument(dom.window.document, "benchmark.example.test");
      const page = matchPage(dom.window.document, fields, profile);
      const expected = golden.expectedProfileKeys;
      const expectedSet = new Set(expected);
      const stats = categoryStats.get(golden.category) ?? { scanned: 0, eligible: 0, auto: 0, correct: 0 };
      stats.scanned += fields.length;
      stats.eligible += expected.length;
      stats.auto += page.matches.filter((match) => match.decision === "AUTO").length;
      categoryStats.set(golden.category, stats);
      totalScanned += fields.length;
      eligible += expected.length;
      autoAttempts += page.matches.filter((match) => match.decision === "AUTO").length;
      suggestCount += page.matches.filter((match) => match.decision === "SUGGEST").length;
      manualCount += page.matches.filter((match) => match.decision === "MANUAL").length;
      abstainCount += page.matches.filter((match) => match.decision === "ABSTAIN").length;
      unsupportedCount += page.matches.filter((match) => match.decision === "MANUAL" && match.reason === "UNSUPPORTED_CONTROL").length;
      const report = await executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
      const filledResults = report.results.filter((result) => result.status === "FILLED");
      autoFilled += filledResults.length;
      const wrongResults = filledResults.filter((result) => !result.profileKey || !expectedSet.has(result.profileKey));
      negativeAutoMatches += wrongResults.length;
      for (const profileKey of expected) {
        const result = report.results.find((item) => item.profileKey === profileKey);
        if (result?.status === "FILLED") {
          correct += 1;
          stats.correct += 1;
        }
      }
      seriousWrongAutofill += filledResults.filter((result) => !result.profileKey || !expectedSet.has(result.profileKey)).length;
      if (golden.category === "repeat") {
        repeatEligible += expected.length;
        repeatCorrect += report.results.filter((result) => expectedSet.has(result.profileKey ?? "") && result.status === "FILLED").length;
      }
      dom.window.close();
    }

    const precision = autoFilled === 0 ? 1 : correct / autoFilled;
    const coverage = eligible === 0 ? 1 : correct / eligible;
    const repeatIdentity = repeatEligible === 0 ? 1 : repeatCorrect / repeatEligible;
    const nativeEligible = GOLDEN_CASES.filter((golden) => golden.category !== "custom-select").reduce((sum, golden) => sum + golden.expectedProfileKeys.length, 0);
    const customStats = categoryStats.get("custom-select") ?? { scanned: 0, eligible: 0, auto: 0, correct: 0 };
    const nativeCorrect = correct - customStats.correct;
    const nativeCoverage = nativeEligible === 0 ? 1 : nativeCorrect / nativeEligible;
    const customCoverage = customStats.eligible === 0 ? 1 : customStats.correct / customStats.eligible;
    expect(negativeAutoMatches).toBe(0);
    expect(seriousWrongAutofill).toBe(0);
    expect(precision).toBeGreaterThanOrEqual(0.99);
    expect(coverage).toBeGreaterThanOrEqual(0.95);
    expect(nativeCoverage).toBeGreaterThanOrEqual(0.95);
    expect(customCoverage).toBeGreaterThanOrEqual(0.9);
    expect(repeatIdentity).toBe(1);
    const categoryText = Array.from(categoryStats.entries()).map(([category, stats]) => `${category}:scanned=${stats.scanned},eligible=${stats.eligible},auto=${stats.auto},correct=${stats.correct}`).join(" ");
    process.stdout.write(`BENCHMARK cases=${GOLDEN_CASES.length} total_scanned=${totalScanned} eligible=${eligible} auto=${autoAttempts} auto_filled=${autoFilled} suggest=${suggestCount} manual=${manualCount} abstain=${abstainCount} unsupported=${unsupportedCount} auto_correct=${correct} precision=${(precision * 100).toFixed(1)}% coverage=${(coverage * 100).toFixed(1)}% native_coverage=${(nativeCoverage * 100).toFixed(1)}% custom_select_coverage=${(customCoverage * 100).toFixed(1)}% repeat_identity=${(repeatIdentity * 100).toFixed(1)}% serious_wrong_autofill=${seriousWrongAutofill} negative_auto=${negativeAutoMatches} manual_rate=${(manualCount / Math.max(1, totalScanned) * 100).toFixed(1)}% suggest_rate=${(suggestCount / Math.max(1, totalScanned) * 100).toFixed(1)}% category_stats=${categoryText}\n`);
  });
});
