export interface BasicProfile {
  fullName: string;
  englishName: string;
  gender: string;
  birthDate: string;
  phone: string;
  email: string;
  currentCity: string;
  address: string;
  nationality: string;
  politicalStatus: string;
  identityNumber: string;
}

export interface EducationEntry {
  id: string;
  school: string;
  schoolEnglish: string;
  degree: string;
  major: string;
  department: string;
  startDate: string;
  endDate: string;
  gpa: string;
  gpaScale: string;
  ranking: string;
  description: string;
}

export interface ProjectEntry {
  id: string;
  name: string;
  role: string;
  startDate: string;
  endDate: string;
  link: string;
  description: string;
}

export interface ResearchEntry {
  id: string;
  name: string;
  role: string;
  venue: string;
  startDate: string;
  endDate: string;
  link: string;
  description: string;
}

export interface AwardEntry {
  id: string;
  name: string;
  issuer: string;
  date: string;
  description: string;
}

export interface LanguageEntry {
  id: string;
  name: string;
  level: string;
  score: string;
}

export interface SkillEntry {
  id: string;
  name: string;
  level: string;
  description: string;
}

export interface CustomField {
  id: string;
  label: string;
  value: string;
}

export interface ResumeProfile {
  version: 1;
  basic: BasicProfile;
  education: EducationEntry[];
  projects: ProjectEntry[];
  research: ResearchEntry[];
  awards: AwardEntry[];
  languages: LanguageEntry[];
  skills: SkillEntry[];
  customFields: CustomField[];
}

export type ProfileCollection =
  | "education"
  | "projects"
  | "research"
  | "awards"
  | "languages"
  | "skills"
  | "customFields";

export type ProfileKey = string;

export type FormElement =
  | HTMLInputElement
  | HTMLTextAreaElement
  | HTMLSelectElement
  | HTMLElement;

export type FieldCapability = "text" | "textarea" | "select" | "contenteditable" | "unsupported";

export interface FieldDescriptor {
  id: string;
  tag: string;
  type: string;
  label: string;
  name: string;
  placeholder: string;
  section: string;
  sectionLabel: string;
  occurrence: number;
  required: boolean;
  readOnly: boolean;
  currentValue: string;
  fillCapability: FieldCapability;
  hostname: string;
  fingerprint: string;
}

export interface ScannedField extends FieldDescriptor {
  element: FormElement;
}

export interface ProfileCandidate {
  profileKey: ProfileKey;
  canonicalKey: string;
  displayName: string;
  value: string;
  section: string;
  occurrence: number;
  sensitive: boolean;
  aliases: string[];
  expectedTypes: string[];
}

export type MatchDecision = "AUTO" | "SUGGEST" | "ABSTAIN" | "MANUAL" | "EXISTING";

export type MatchReason =
  | "READY"
  | "MAPPED_FIELD"
  | "LOW_CONFIDENCE"
  | "NO_MATCH"
  | "NO_PROFILE_VALUE"
  | "EXISTING_VALUE"
  | "UNSUPPORTED_CONTROL"
  | "FILE_UPLOAD"
  | "CHECKBOX_OR_RADIO"
  | "READONLY"
  | "SENSITIVE_REVIEW";

export interface FieldMatch {
  descriptor: FieldDescriptor;
  candidate?: ProfileCandidate;
  score: number;
  confidence: number;
  decision: MatchDecision;
  reason: MatchReason;
  sensitiveReview: boolean;
  mapped: boolean;
}

export type ResultStatus =
  | "FILLED"
  | "SKIPPED"
  | "FAILED"
  | "MANUAL_REQUIRED"
  | "UNCERTAIN"
  | "NO_MATCH";

export interface FillResult {
  fieldId: string;
  label: string;
  profileKey?: ProfileKey;
  status: ResultStatus;
  reason: string;
  expected?: string;
  actual?: string;
  sensitiveReview?: boolean;
  descriptor?: FieldDescriptor;
}

export interface FillReport {
  hostname: string;
  scanned: number;
  autoCandidates: number;
  suggestions: number;
  abstained: number;
  results: FillResult[];
  generatedAt: string;
}

export interface FieldMapping {
  id: string;
  hostname: string;
  fingerprint: string;
  profileKey: ProfileKey;
  createdAt: string;
  updatedAt: string;
}

export interface StoredSettings {
  overwriteExisting: boolean;
}

export interface CandidateDefinition {
  canonicalKey: string;
  displayName: string;
  section: string;
  path: string;
  sensitive?: boolean;
  aliases: string[];
  expectedTypes?: string[];
}

export interface AdapterContext {
  hostname: string;
  document: Document;
}

export interface AtsAdapter {
  id: string;
  displayName: string;
  detect(context: AdapterContext): boolean;
  enrichField?(field: FieldDescriptor): Partial<FieldDescriptor>;
}
