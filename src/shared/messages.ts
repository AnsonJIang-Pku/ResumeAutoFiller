import type { FieldMapping, FieldMatch, FillReport, ResumeProfile, StoredSettings } from "./types";

export type ExtensionMessage =
  | { type: "SCAN_PAGE"; profile: ResumeProfile; mappings: FieldMapping[] }
  | { type: "FILL_HIGH_CONFIDENCE"; profile: ResumeProfile; overwriteExisting: boolean }
  | { type: "FILL_SELECTED_SUGGESTION"; profile: ResumeProfile; fieldId: string; sessionId: string; profileKey?: string; overwriteExisting: boolean }
  | { type: "GET_STATUS" }
  | { type: "SAVE_SETTINGS"; settings: StoredSettings }
  | { type: "FORGET_MAPPING"; mappingId: string }
  | { type: "FORGET_MAPPINGS"; hostname?: string }
  | { type: "CLEAR_LOCAL_DATA" };

export interface PublicMatch extends Omit<FieldMatch, "descriptor"> {
  descriptor: FieldMatch["descriptor"];
}

export interface ScanResponse {
  ok: boolean;
  error?: string;
  adapterId?: string;
  adapterName?: string;
  sessionId?: string;
  matches?: PublicMatch[];
  scanned?: number;
  autoCandidates?: number;
  suggestions?: number;
  abstained?: number;
}

export interface FillResponse {
  ok: boolean;
  error?: string;
  report?: FillReport;
}

export interface StatusResponse {
  ok: boolean;
  error?: string;
  profile?: ResumeProfile;
  mappingsCount?: number;
  settings?: StoredSettings;
}
