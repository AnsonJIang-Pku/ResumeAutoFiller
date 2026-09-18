import { describe, expect, it } from "vitest";
import { emptyEducation, emptyProfile, buildProfileCandidates, normalizeProfile, resolveProfileValue } from "../src/shared/profile";

describe("profile schema", () => {
  it("creates stable IDs for repeat entries and preserves them through normalization", () => {
    const profile = emptyProfile();
    const first = { ...emptyEducation(), id: "education-undergrad", school: "虚构大学" };
    profile.education = [first];
    const normalized = normalizeProfile(profile);
    expect(normalized.education[0]?.id).toBe("education-undergrad");
    expect(resolveProfileValue(normalized, "education.education-undergrad.school")).toBe("虚构大学");
  });

  it("builds candidate keys from stable IDs rather than array positions", () => {
    const profile = emptyProfile();
    profile.basic.email = "alice@example.com";
    profile.education = [
      { ...emptyEducation(), id: "edu-master", school: "硕士示例大学" },
      { ...emptyEducation(), id: "edu-undergrad", school: "本科示例大学" }
    ];
    const candidates = buildProfileCandidates(profile).filter((candidate) => candidate.canonicalKey === "education.school");
    expect(candidates.map((candidate) => candidate.profileKey)).toEqual([
      "education.edu-master.school",
      "education.edu-undergrad.school"
    ]);
    expect(candidates[1]?.value).toBe("本科示例大学");
  });
});
