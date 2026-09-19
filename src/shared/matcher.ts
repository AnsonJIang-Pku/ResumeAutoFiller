import { containsAlias, isMeaningfulValue, normalizeText } from "./normalize";
import { buildProfileCandidates } from "./profile";
import { findMapping } from "./mapping";
import type { FieldMapping, FieldMatch, ProfileCandidate, ResumeProfile, ScannedField } from "./types";

export const AUTO_THRESHOLD = 80;
export const SUGGEST_THRESHOLD = 55;

function labelMatches(field: ScannedField, candidate: ProfileCandidate): { score: number; exact: boolean } {
  const label = normalizeText(field.label);
  if (!label) return { score: 0, exact: false };
  for (const alias of candidate.aliases) {
    if (label === normalizeText(alias)) return { score: 82, exact: true };
  }
  if (candidate.aliases.some((alias) => containsAlias(label, alias))) return { score: 58, exact: false };
  return { score: 0, exact: false };
}

function metadataScore(field: ScannedField, candidate: ProfileCandidate): number {
  const metadata = [field.name, field.placeholder, field.type].map(normalizeText).filter(Boolean);
  if (metadata.length === 0) return 0;
  if (candidate.aliases.some((alias) => metadata.some((value) => value === normalizeText(alias)))) return 38;
  if (candidate.aliases.some((alias) => metadata.some((value) => containsAlias(value, alias)))) return 24;
  return 0;
}

function typeScore(field: ScannedField, candidate: ProfileCandidate): number {
  if (candidate.expectedTypes.length > 0 && candidate.expectedTypes.includes(field.type)) return 12;
  if (candidate.expectedTypes.length === 0 && ["text", "email", "tel", "number", "date", "month", "textarea"].includes(field.type)) return 4;
  return 0;
}

function sectionScore(field: ScannedField, candidate: ProfileCandidate): number {
  if (field.section === candidate.section) return 12;
  if (field.section === "other" || field.section === "") return 2;
  return -18;
}

function occurrenceScore(field: ScannedField, candidate: ProfileCandidate): number {
  const isRepeat = ["education", "projects", "research", "awards", "languages", "skills"].includes(candidate.section);
  if (!isRepeat) return 0;
  return field.occurrence === candidate.occurrence ? 10 : -18;
}

function candidateScore(field: ScannedField, candidate: ProfileCandidate): number {
  return labelMatches(field, candidate).score + metadataScore(field, candidate) + typeScore(field, candidate) + sectionScore(field, candidate) + occurrenceScore(field, candidate);
}

function unsupportedReason(field: ScannedField): FieldMatch["reason"] | undefined {
  if (field.readOnly) return "READONLY";
  if (field.type === "file") return "FILE_UPLOAD";
  if (["password", "checkbox", "radio"].includes(field.type)) return "CHECKBOX_OR_RADIO";
  if (["spinbutton", "select-multiple", "time", "datetime-local", "week", "range", "color", "image"].includes(field.type)) return "UNSUPPORTED_CONTROL";
  if (field.fillCapability === "unsupported") return "UNSUPPORTED_CONTROL";
  return undefined;
}

function baseMatch(field: ScannedField, reason: FieldMatch["reason"], decision: FieldMatch["decision"]): FieldMatch {
  return { descriptor: field, score: 0, confidence: 0, decision, reason, sensitiveReview: false, mapped: false };
}

export function matchField(field: ScannedField, candidates: ProfileCandidate[], mappings: FieldMapping[] = []): FieldMatch {
  const manualReason = unsupportedReason(field);
  if (manualReason) return baseMatch(field, manualReason, "MANUAL");

  const usable = candidates.filter((candidate) => isMeaningfulValue(candidate.value));
  if (usable.length === 0) return baseMatch(field, "NO_PROFILE_VALUE", "ABSTAIN");

  const exactMapping = findMapping(field, mappings);
  if (exactMapping) {
    const mappedCandidate = usable.find((candidate) => candidate.profileKey === exactMapping.profileKey);
    if (mappedCandidate) {
      return {
        descriptor: field,
        candidate: mappedCandidate,
        score: 100,
        confidence: 100,
        decision: "AUTO",
        reason: "MAPPED_FIELD",
        sensitiveReview: mappedCandidate.sensitive,
        mapped: true
      };
    }
  }

  const ranked = usable
    .map((candidate) => ({ candidate, score: candidateScore(field, candidate) }))
    .sort((left, right) => right.score - left.score);
  const best = ranked[0];
  if (!best || best.score < SUGGEST_THRESHOLD) return baseMatch(field, "NO_MATCH", "ABSTAIN");
  const runnerUp = ranked[1];
  const ambiguous = Boolean(runnerUp && best.score - runnerUp.score < 8);
  if (ambiguous) {
    return {
      descriptor: field,
      candidate: best.candidate,
      score: best.score,
      confidence: Math.max(0, Math.min(99, best.score - 10)),
      decision: "ABSTAIN",
      reason: "LOW_CONFIDENCE",
      sensitiveReview: best.candidate.sensitive,
      mapped: false
    };
  }
  const decision: FieldMatch["decision"] = best.score >= AUTO_THRESHOLD ? "AUTO" : "SUGGEST";
  return {
    descriptor: field,
    candidate: best.candidate,
    score: best.score,
    confidence: Math.max(0, Math.min(100, best.score)),
    decision,
    reason: best.candidate.sensitive ? "SENSITIVE_REVIEW" : decision === "AUTO" ? "READY" : "LOW_CONFIDENCE",
    sensitiveReview: best.candidate.sensitive,
    mapped: false
  };
}

export function matchFields(fields: ScannedField[], profile: ResumeProfile, mappings: FieldMapping[] = []): FieldMatch[] {
  const candidates = buildProfileCandidates(profile);
  return fields.map((field) => {
    const match = matchField(field, candidates, mappings);
    if (field.currentValue && match.decision !== "MANUAL") {
      return { ...match, decision: "EXISTING", reason: "EXISTING_VALUE" };
    }
    return match;
  });
}
