import { describe, expect, it } from "vitest";
import { emptyEducation, emptyProfile } from "../src/shared/profile";
import { loadMappings, loadProfile, loadSettings, saveMappings, saveProfile, saveSettings, STORAGE_KEYS, type StorageAreaLike } from "../src/shared/storage";

class MemoryStorage implements StorageAreaLike {
  private readonly values = new Map<string, unknown>();
  async get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>> {
    const requested = typeof keys === "string" ? [keys] : Array.isArray(keys) ? keys : keys ? Object.keys(keys) : Array.from(this.values.keys());
    return Object.fromEntries(requested.map((key) => [key, this.values.get(key)]));
  }
  async set(items: Record<string, unknown>): Promise<void> {
    for (const [key, value] of Object.entries(items)) this.values.set(key, value);
  }
  async remove(keys: string | string[]): Promise<void> {
    for (const key of Array.isArray(keys) ? keys : [keys]) this.values.delete(key);
  }
  async clear(): Promise<void> { this.values.clear(); }
}

describe("chrome.storage.local boundary", () => {
  it("round-trips profile, mappings and settings without sync storage", async () => {
    const area = new MemoryStorage();
    const profile = emptyProfile();
    profile.basic.email = "alice@example.com";
    await saveProfile(profile, area);
    await saveMappings([{ id: "mapping-1", hostname: "jobs.example.test", fingerprint: "fnv1a-1", profileKey: "basic.email", createdAt: "now", updatedAt: "now" }], area);
    await saveSettings({ overwriteExisting: true }, area);
    expect((await loadProfile(area)).basic.email).toBe("alice@example.com");
    expect((await loadMappings(area))).toHaveLength(1);
    expect((await loadSettings(area)).overwriteExisting).toBe(true);
    expect(STORAGE_KEYS.mappings).not.toContain("sync");
  });

  it("clears repeat mappings when the Profile repeat identity order changes", async () => {
    const area = new MemoryStorage();
    const first = emptyProfile();
    first.education = [{ ...emptyEducation(), id: "edu-1" }, { ...emptyEducation(), id: "edu-2" }];
    await saveProfile(first, area);
    await saveMappings([{ id: "mapping-1", hostname: "jobs.example.test", fingerprint: "fnv1a-1", profileKey: "education.edu-1.school", createdAt: "now", updatedAt: "now" }], area);
    const reordered = { ...first, education: [first.education[1]!, first.education[0]!] };
    await saveProfile(reordered, area);
    expect(await loadMappings(area)).toEqual([]);
  });
});
