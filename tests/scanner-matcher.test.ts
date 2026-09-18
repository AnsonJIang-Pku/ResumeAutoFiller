import { describe, expect, it } from "vitest";
import { matchFields } from "../src/shared/matcher";
import { emptyEducation, emptyProfile, emptyProject } from "../src/shared/profile";
import { scanDocument } from "../src/shared/scanner";
import { domFromHtml } from "./helpers";

const basicProfile = () => {
  const profile = emptyProfile();
  profile.basic.fullName = "Alice Example";
  profile.basic.email = "alice@example.com";
  profile.basic.phone = "+86 13800000000";
  profile.basic.currentCity = "示例市";
  profile.education = [
    { ...emptyEducation(), id: "edu-1", school: "本科示例大学", major: "计算机科学", endDate: "2020-06" },
    { ...emptyEducation(), id: "edu-2", school: "硕士示例大学", major: "软件工程", endDate: "2024-06" }
  ];
  return profile;
};

describe("DOM scanner and deterministic matcher", () => {
  it("extracts labels from explicit labels, ARIA, nearby labels and placeholders", () => {
    const dom = domFromHtml(`<!doctype html><main><label for="a">姓名</label><input id="a"><input aria-label="手机号" type="tel"><span id="email-label">电子邮件</span><input aria-labelledby="email-label" type="email"><input placeholder="现居城市"></main>`);
    const fields = scanDocument(dom.window.document, "jobs.example.test");
    expect(fields.map((field) => field.label)).toEqual(["姓名", "手机号", "电子邮件", "现居城市"]);
    dom.window.close();
  });

  it("auto-matches standard fields and abstains on unknown labels", () => {
    const dom = domFromHtml(`<!doctype html><main><label>姓名</label><input><label>邮箱</label><input type="email"><label>完全未知字段</label><input></main>`);
    const matches = matchFields(scanDocument(dom.window.document, "jobs.example.test"), basicProfile());
    expect(matches[0]?.decision).toBe("AUTO");
    expect(matches[1]?.decision).toBe("AUTO");
    expect(matches[2]?.decision).toBe("ABSTAIN");
    dom.window.close();
  });

  it("does not treat a short English alias as a substring match inside an unrelated word", () => {
    const dom = domFromHtml(`<!doctype html><section><h2>项目经历</h2><label>Photo</label><input></section>`);
    const profile = basicProfile();
    profile.projects = [{ ...emptyProject(), id: "project-1", endDate: "2024-06" }];
    const match = matchFields(scanDocument(dom.window.document, "jobs.example.test"), profile)[0];
    expect(match?.decision).toBe("ABSTAIN");
    expect(match?.candidate?.canonicalKey).not.toBe("projects.endDate");
    dom.window.close();
  });

  it("aligns repeat fields by occurrence and stable Profile IDs", () => {
    const dom = domFromHtml(`<!doctype html><main><fieldset><legend>教育经历</legend><label>学校</label><input><label>专业</label><input></fieldset><fieldset><legend>教育经历</legend><label>学校</label><input><label>专业</label><input></fieldset></main>`);
    const matches = matchFields(scanDocument(dom.window.document, "jobs.example.test"), basicProfile());
    const schools = matches.filter((match) => match.candidate?.canonicalKey === "education.school");
    expect(schools.map((match) => match.candidate?.profileKey)).toEqual(["education.edu-1.school", "education.edu-2.school"]);
    expect(schools.every((match) => match.decision === "AUTO")).toBe(true);
    dom.window.close();
  });

  it("does not expose hidden or disabled controls to the fill plan and marks manual controls", () => {
    const dom = domFromHtml(`<!doctype html><input type="hidden" name="email"><input disabled name="phone"><label>上传简历</label><input type="file"><label>密码</label><input type="password"><label>同意</label><input type="checkbox">`);
    const fields = scanDocument(dom.window.document, "jobs.example.test");
    expect(fields).toHaveLength(3);
    const matches = matchFields(fields, basicProfile());
    expect(matches.map((match) => match.decision)).toEqual(["MANUAL", "MANUAL", "MANUAL"]);
    dom.window.close();
  });

  it("scans shadow DOM controls only after an explicit scan", () => {
    const dom = domFromHtml(`<!doctype html><main><resume-field></resume-field><script>const host=document.querySelector('resume-field');const root=host.attachShadow({mode:'open'});root.innerHTML='<label>手机号</label><input type="tel">';</script></main>`, "https://jobs.example.test/app", "dangerously");
    const fields = scanDocument(dom.window.document, "jobs.example.test");
    expect(fields.some((field) => field.type === "tel")).toBe(true);
    dom.window.close();
  });

  it("resolves ARIA labels inside the same shadow root", () => {
    const dom = domFromHtml(`<!doctype html><resume-field></resume-field><script>const host=document.querySelector('resume-field');const root=host.attachShadow({mode:'open'});root.innerHTML='<span id="phone-label">手机号</span><input aria-labelledby="phone-label" type="tel">';</script>`, "https://jobs.example.test/app", "dangerously");
    const field = scanDocument(dom.window.document, "jobs.example.test")[0];
    expect(field?.label).toBe("手机号");
    dom.window.close();
  });

  it("abstains from multiple select and unsupported native input types", () => {
    const dom = domFromHtml(`<!doctype html><label>结束时间</label><input type="time"><label>语言</label><select multiple><option>英语</option></select>`);
    const profile = basicProfile();
    profile.languages = [{ id: "language-1", name: "英语", level: "熟练", score: "" }];
    const matches = matchFields(scanDocument(dom.window.document, "jobs.example.test"), profile);
    expect(matches.map((match) => match.decision)).toEqual(["MANUAL", "MANUAL"]);
    dom.window.close();
  });

  it("recognizes empty and plaintext-only contenteditable controls", () => {
    const dom = domFromHtml(`<!doctype html><div contenteditable></div><div contenteditable="plaintext-only"></div>`);
    const fields = scanDocument(dom.window.document, "jobs.example.test");
    expect(fields.map((field) => field.fillCapability)).toEqual(["contenteditable", "contenteditable"]);
    dom.window.close();
  });
});
