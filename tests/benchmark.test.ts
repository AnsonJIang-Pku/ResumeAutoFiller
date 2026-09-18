import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { emptyAward, emptyEducation, emptyLanguage, emptyProfile, emptyProject, emptyResearch, emptySkill } from "../src/shared/profile";
import { scanDocument } from "../src/shared/scanner";
import type { ResumeProfile } from "../src/shared/types";
import { domFromHtml } from "./helpers";

interface GoldenCase {
  fixture: string;
  expectedProfileKeys: string[];
}

const GOLDEN_CASES: GoldenCase[] = [
  { fixture: "01-native-form.html", expectedProfileKeys: ["basic.fullName", "basic.email", "basic.phone", "basic.currentCity", "basic.address"] },
  { fixture: "02-ant-like-form.html", expectedProfileKeys: ["basic.fullName", "basic.email", "education.edu-1.school"] },
  { fixture: "03-element-like-form.html", expectedProfileKeys: ["basic.phone", "basic.email"] },
  { fixture: "04-repeat-education.html", expectedProfileKeys: ["education.edu-1.school", "education.edu-1.major", "education.edu-1.endDate", "education.edu-2.school", "education.edu-2.major", "education.edu-2.endDate", "education.edu-3.school", "education.edu-3.major", "education.edu-3.endDate"] },
  { fixture: "05-repeat-project.html", expectedProfileKeys: ["projects.project-1.name", "projects.project-1.role", "projects.project-1.description", "projects.project-2.name", "projects.project-2.role", "projects.project-2.description", "projects.project-3.name", "projects.project-3.role", "projects.project-3.description"] },
  { fixture: "06-aria-labels.html", expectedProfileKeys: ["basic.email", "basic.phone", "basic.fullName", "basic.currentCity", "basic.nationality"] },
  { fixture: "07-contenteditable.html", expectedProfileKeys: ["projects.project-1.name", "projects.project-1.description"] },
  { fixture: "08-native-select.html", expectedProfileKeys: ["basic.gender"] },
  { fixture: "09-hidden-disabled-fields.html", expectedProfileKeys: [] },
  { fixture: "10-dynamic-fields.html", expectedProfileKeys: ["education.edu-1.school"] },
  { fixture: "11-shadow-dom.html", expectedProfileKeys: ["basic.phone"] },
  { fixture: "12-complex-controls.html", expectedProfileKeys: ["basic.birthDate"] }
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
    { ...emptyEducation(), id: "edu-1", school: "本科示例大学", degree: "本科", major: "计算机科学", endDate: "2020-06" },
    { ...emptyEducation(), id: "edu-2", school: "硕士示例大学", degree: "硕士", major: "软件工程", endDate: "2024-06" },
    { ...emptyEducation(), id: "edu-3", school: "博士示例大学", degree: "博士", major: "人工智能", endDate: "2028-06" }
  ];
  profile.projects = [
    { ...emptyProject(), id: "project-1", name: "示例数据平台", role: "开发者", description: "第一个虚构项目描述。" },
    { ...emptyProject(), id: "project-2", name: "示例搜索系统", role: "负责人", description: "第二个虚构项目描述。" },
    { ...emptyProject(), id: "project-3", name: "示例可视化工具", role: "开发者", description: "第三个虚构项目描述。" }
  ];
  profile.research = [{ ...emptyResearch(), id: "research-1", name: "示例研究" }];
  profile.awards = [{ ...emptyAward(), id: "award-1", name: "示例奖项" }];
  profile.languages = [{ ...emptyLanguage(), id: "language-1", name: "英语", level: "熟练", score: "示例成绩" }];
  profile.skills = [{ ...emptySkill(), id: "skill-1", name: "TypeScript", level: "熟练", description: "示例技能" }];
  return profile;
}

describe("golden benchmark", () => {
  it("measures precision and coverage across every committed fixture with explicit negative ground truth", async () => {
    const profile = goldenProfile();
    let eligible = 0;
    let correct = 0;
    let autoAttempts = 0;
    let negativeAutoMatches = 0;
    let repeatCorrect = 0;
    let repeatEligible = 0;

    for (const golden of GOLDEN_CASES) {
      const html = await readFile(new URL(`../test-fixtures/${golden.fixture}`, import.meta.url), "utf8");
      const runsScripts = golden.fixture === "10-dynamic-fields.html" || golden.fixture === "11-shadow-dom.html" ? "dangerously" : undefined;
      const dom = domFromHtml(html, `https://benchmark.example.test/${golden.fixture}`, runsScripts);
      const fields = scanDocument(dom.window.document, "benchmark.example.test");
      const page = matchPage(dom.window.document, fields, profile);
      const expected = golden.expectedProfileKeys;
      const expectedSet = new Set(expected);
      eligible += expected.length;
      autoAttempts += page.matches.filter((match) => match.decision === "AUTO").length;
      negativeAutoMatches += page.matches.filter((match) => match.decision === "AUTO" && (!match.candidate || !expectedSet.has(match.candidate.profileKey))).length;
      const report = executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
      for (const profileKey of expected) {
        const result = report.results.find((item) => item.profileKey === profileKey);
        if (result?.status === "FILLED") correct += 1;
      }
      if (golden.fixture === "04-repeat-education.html" || golden.fixture === "05-repeat-project.html") {
        repeatEligible += expected.length;
        repeatCorrect += report.results.filter((result) => expectedSet.has(result.profileKey ?? "") && result.status === "FILLED").length;
      }
      dom.window.close();
    }

    const precision = autoAttempts === 0 ? 1 : correct / autoAttempts;
    const coverage = eligible === 0 ? 1 : correct / eligible;
    const repeatIdentity = repeatEligible === 0 ? 1 : repeatCorrect / repeatEligible;
    expect(negativeAutoMatches).toBe(0);
    expect(precision).toBeGreaterThanOrEqual(0.99);
    expect(coverage).toBeGreaterThanOrEqual(0.95);
    expect(repeatIdentity).toBe(1);
    process.stdout.write(`BENCHMARK cases=${GOLDEN_CASES.length} eligible=${eligible} auto_attempts=${autoAttempts} correct=${correct} precision=${(precision * 100).toFixed(1)}% coverage=${(coverage * 100).toFixed(1)}% repeat_identity=${(repeatIdentity * 100).toFixed(1)}% negative_auto=${negativeAutoMatches}\n`);
  });
});
