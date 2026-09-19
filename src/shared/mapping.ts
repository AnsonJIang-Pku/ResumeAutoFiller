import { createStableId } from "./ids";
import type { FieldDescriptor, FieldMapping, FillReport, ProfileKey } from "./types";

export function mappingForField(field: FieldDescriptor, profileKey: ProfileKey, now = new Date().toISOString()): FieldMapping {
  return {
    id: createStableId("mapping"),
    hostname: field.hostname,
    fingerprint: field.fingerprint,
    profileKey,
    fieldLabel: field.label,
    fieldName: field.name,
    fieldSection: field.section,
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

export function forgetMapping(existing: FieldMapping[], mappingId: string): FieldMapping[] {
  return existing.filter((mapping) => mapping.id !== mappingId);
}

export function forgetAllMappings(): FieldMapping[] {
  return [];
}

/**
 * Only a result that made it through the executor's post-fill verification can
 * create memory. Failed, skipped, uncertain, and manual results deliberately
 * leave the existing list untouched.
 */
export function mappingsAfterSuccessfulReport(existing: FieldMapping[], report: FillReport, now = new Date().toISOString()): FieldMapping[] {
  let next = existing;
  for (const result of report.results) {
    if (result.status !== "FILLED" || !result.profileKey || !result.descriptor) continue;
    next = upsertMapping(next, mappingForField(result.descriptor as FieldDescriptor, result.profileKey, now));
  }
  return next;
}
