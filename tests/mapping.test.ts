import { describe, expect, it } from "vitest";
import { executeMatches, matchPage } from "../src/shared/engine";
import { forgetAllMappings, forgetMapping, forgetMappingsForHost, mappingForField, mappingsAfterSuccessfulReport } from "../src/shared/mapping";
import { emptyEducation, emptyProfile } from "../src/shared/profile";
import { scanDocument } from "../src/shared/scanner";
import type { FieldMapping, FillReport } from "../src/shared/types";
import { domFromHtml } from "./helpers";

function educationProfile(ids = ["edu-1", "edu-2"]) {
  const profile = emptyProfile();
  profile.education = ids.map((id, index) => ({
    ...emptyEducation(),
    id,
    school: index === 0 ? "本科示例大学" : "硕士示例大学"
  }));
  return profile;
}

function sampleMappings(): FieldMapping[] {
  return [
    { id: "mapping-a1", hostname: "jobs.a.test", fingerprint: "fingerprint-a1", profileKey: "basic.email", createdAt: "2026-01-01", updatedAt: "2026-01-02" },
    { id: "mapping-a2", hostname: "jobs.a.test", fingerprint: "fingerprint-a2", profileKey: "basic.phone", createdAt: "2026-01-01", updatedAt: "2026-01-02" },
    { id: "mapping-b1", hostname: "jobs.b.test", fingerprint: "fingerprint-b1", profileKey: "basic.email", createdAt: "2026-01-01", updatedAt: "2026-01-02" }
  ];
}

describe("mapping memory safety", () => {
  it("reuses only the exact host and fingerprint", () => {
    const dom = domFromHtml("<!doctype html><label>网页自定义字段</label><input>");
    const profile = educationProfile();
    const field = scanDocument(dom.window.document, "jobs.a.test")[0];
    if (!field) throw new Error("field missing");
    const mapping = mappingForField(field, "education.edu-1.school", "2026-01-01T00:00:00.000Z");
    const mapped = matchPage(dom.window.document, [field], profile, [mapping]).matches[0];
    expect(mapped?.decision).toBe("AUTO");
    expect(mapped?.reason).toBe("MAPPED_FIELD");
    expect(mapping.fieldLabel).toBe("网页自定义字段");
    expect(mapping.fingerprint).toMatch(/^fnv1a128-[0-9a-f]{32}$/u);
    dom.window.close();
  });

  it("does not reuse after a label changes", () => {
    const dom = domFromHtml("<!doctype html><label>网页自定义字段</label><input>");
    const profile = educationProfile();
    const original = scanDocument(dom.window.document, "jobs.a.test")[0];
    if (!original) throw new Error("field missing");
    const mapping = mappingForField(original, "education.edu-1.school");
    dom.window.document.querySelector("label")!.textContent = "完全不同的字段";
    const changed = scanDocument(dom.window.document, "jobs.a.test")[0];
    if (!changed) throw new Error("changed field missing");
    const match = matchPage(dom.window.document, [changed], profile, [mapping]).matches[0];
    expect(match?.mapped).toBe(false);
    expect(match?.reason).not.toBe("MAPPED_FIELD");
    dom.window.close();
  });

  it("does not reuse a first-occurrence mapping for a second repeat row", () => {
    const dom = domFromHtml("<!doctype html><main><fieldset><legend>教育经历</legend><label>学校</label><input></fieldset><fieldset><legend>教育经历</legend><label>学校</label><input></fieldset></main>");
    const profile = educationProfile();
    const fields = scanDocument(dom.window.document, "jobs.a.test");
    const first = fields[0];
    const second = fields[1];
    if (!first || !second) throw new Error("repeat fields missing");
    const mapping = mappingForField(first, "education.edu-1.school");
    const matches = matchPage(dom.window.document, fields, profile, [mapping]).matches;
    expect(matches[0]?.mapped).toBe(true);
    expect(matches[1]?.mapped).toBe(false);
    expect(matches[1]?.reason).not.toBe("MAPPED_FIELD");
    dom.window.close();
  });

  it("blocks a mapping copied to a different hostname", () => {
    const dom = domFromHtml("<!doctype html><label>网页自定义字段</label><input>");
    const profile = educationProfile();
    const original = scanDocument(dom.window.document, "jobs.a.test")[0];
    const otherHost = scanDocument(dom.window.document, "jobs.b.test")[0];
    if (!original || !otherHost) throw new Error("field missing");
    const mapping = mappingForField(original, "education.edu-1.school");
    const match = matchPage(dom.window.document, [otherHost], profile, [mapping]).matches[0];
    expect(match?.mapped).toBe(false);
    expect(match?.reason).not.toBe("MAPPED_FIELD");
    dom.window.close();
  });

  it("does not reuse a mapping whose stable Profile key was deleted", () => {
    const dom = domFromHtml("<!doctype html><label>学校</label><input>");
    const field = scanDocument(dom.window.document, "jobs.a.test")[0];
    if (!field) throw new Error("field missing");
    const mapping = mappingForField(field, "education.edu-1.school");
    const deletedProfile = educationProfile(["edu-2"]);
    const match = matchPage(dom.window.document, [field], deletedProfile, [mapping]).matches[0];
    expect(match?.mapped).toBe(false);
    expect(match?.reason).not.toBe("MAPPED_FIELD");
    expect(match?.candidate?.profileKey).not.toBe("education.edu-1.school");
    dom.window.close();
  });

  it("learns only after a successful, verified result", async () => {
    const dom = domFromHtml("<!doctype html><label>姓名</label><input>");
    const profile = emptyProfile();
    profile.basic.fullName = "Alice Example";
    const field = scanDocument(dom.window.document, "jobs.a.test")[0];
    if (!field) throw new Error("field missing");
    const page = matchPage(dom.window.document, [field], profile);
    const report = await executeMatches(page, profile, { overwriteExisting: false, autoOnly: true });
    const failed: FillReport = { ...report, results: [{ ...report.results[0]!, status: "FAILED" }] };
    const next = mappingsAfterSuccessfulReport([], report, "2026-01-01T00:00:00.000Z");
    const unchanged = mappingsAfterSuccessfulReport([], failed, "2026-01-01T00:00:00.000Z");
    expect(next).toHaveLength(1);
    expect(next[0]?.profileKey).toBe("basic.fullName");
    expect(unchanged).toEqual([]);
    dom.window.close();
  });

  it("fills a manually corrected suggestion using another stable Profile key", async () => {
    const dom = domFromHtml("<!doctype html><section><h2>基本信息</h2><label>申请学校</label><input name='applicationField'></section>");
    const profile = emptyProfile();
    profile.customFields = [{ id: "custom-school", label: "申请学校", value: "虚构大学" }];
    const field = scanDocument(dom.window.document, "jobs.a.test")[0];
    if (!field) throw new Error("field missing");
    const page = matchPage(dom.window.document, [field], profile);
    expect(page.matches[0]?.decision).toBe("SUGGEST");
    const report = await executeMatches(page, profile, { overwriteExisting: false, selectedFieldIds: new Set([field.id]) });
    expect(report.results[0]?.status).toBe("FILLED");
    expect(dom.window.document.querySelector<HTMLInputElement>("input")?.value).toBe("虚构大学");
    const mappings = mappingsAfterSuccessfulReport([], report, "2026-01-01T00:00:00.000Z");
    expect(mappings[0]?.profileKey).toBe("customFields.custom-school.value");
    dom.window.close();
  });

  it("supports deleting one mapping, one host, or all mappings", () => {
    const mappings = sampleMappings();
    expect(forgetMapping(mappings, "mapping-a1").map((mapping) => mapping.id)).toEqual(["mapping-a2", "mapping-b1"]);
    expect(forgetMappingsForHost(mappings, "jobs.a.test").map((mapping) => mapping.id)).toEqual(["mapping-b1"]);
    expect(forgetAllMappings()).toEqual([]);
  });
});
