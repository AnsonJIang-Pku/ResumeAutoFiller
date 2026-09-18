import { normalizeProfile } from "./profile";
import type { FieldMapping, ResumeProfile, StoredSettings } from "./types";

export const STORAGE_KEYS = {
  profile: "resumeAutofiller.profile",
  mappings: "resumeAutofiller.mappings",
  settings: "resumeAutofiller.settings"
} as const;

export interface StorageAreaLike {
  get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
  remove(keys: string | string[]): Promise<void>;
  clear(): Promise<void>;
}

export function localStorageArea(): StorageAreaLike {
  const chromeApi = (globalThis as typeof globalThis & { chrome?: typeof chrome }).chrome;
  if (!chromeApi?.storage?.local) throw new Error("Browser local storage is unavailable");
  return chromeApi.storage.local;
}

export async function loadProfile(area: StorageAreaLike = localStorageArea()): Promise<ResumeProfile> {
  const result = await area.get(STORAGE_KEYS.profile);
  return normalizeProfile(result[STORAGE_KEYS.profile]);
}

export async function saveProfile(profile: ResumeProfile, area: StorageAreaLike = localStorageArea()): Promise<void> {
  await area.set({ [STORAGE_KEYS.profile]: normalizeProfile(profile) });
}

export async function loadMappings(area: StorageAreaLike = localStorageArea()): Promise<FieldMapping[]> {
  const result = await area.get(STORAGE_KEYS.mappings);
  return Array.isArray(result[STORAGE_KEYS.mappings]) ? result[STORAGE_KEYS.mappings] as FieldMapping[] : [];
}

export async function saveMappings(mappings: FieldMapping[], area: StorageAreaLike = localStorageArea()): Promise<void> {
  await area.set({ [STORAGE_KEYS.mappings]: mappings });
}

export async function loadSettings(area: StorageAreaLike = localStorageArea()): Promise<StoredSettings> {
  const result = await area.get(STORAGE_KEYS.settings);
  const settings = result[STORAGE_KEYS.settings];
  if (!settings || typeof settings !== "object") return { overwriteExisting: false };
  return { overwriteExisting: Boolean((settings as Record<string, unknown>).overwriteExisting) };
}

export async function saveSettings(settings: StoredSettings, area: StorageAreaLike = localStorageArea()): Promise<void> {
  await area.set({ [STORAGE_KEYS.settings]: { overwriteExisting: Boolean(settings.overwriteExisting) } });
}
