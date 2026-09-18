import { createStableId } from "./ids";
import type { FieldDescriptor, FieldMapping, ProfileKey } from "./types";

export function mappingForField(field: FieldDescriptor, profileKey: ProfileKey, now = new Date().toISOString()): FieldMapping {
  return {
    id: createStableId("mapping"),
    hostname: field.hostname,
    fingerprint: field.fingerprint,
    profileKey,
    createdAt: now,
    updatedAt: now
  };
}

export function findMapping(field: FieldDescriptor, mappings: FieldMapping[]): FieldMapping | undefined {
  return mappings.find((mapping) => mapping.hostname === field.hostname && mapping.fingerprint === field.fingerprint);
}

export function upsertMapping(existing: FieldMapping[], next: FieldMapping): FieldMapping[] {
  const withoutSameKey = existing.filter((mapping) => !(mapping.hostname === next.hostname && mapping.fingerprint === next.fingerprint));
  return [...withoutSameKey, next];
}

export function forgetMappingsForHost(existing: FieldMapping[], hostname: string): FieldMapping[] {
  return existing.filter((mapping) => mapping.hostname !== hostname);
}
