import { detectAdapter } from "./adapters";
import { compactText, maskSensitiveValue } from "./normalize";
import { resolveProfileValue } from "./profile";
import { fillElement, hasExistingValue, resultForFailure, verifyElement } from "./executor";
import { matchFields } from "./matcher";
import type { FieldMapping, FieldMatch, FillReport, FillResult, ResumeProfile, ScannedField } from "./types";

export interface PageMatchResult {
  fields: ScannedField[];
  matches: FieldMatch[];
  adapterId: string;
  adapterName: string;
}

export interface ExecuteOptions {
  overwriteExisting: boolean;
  selectedFieldIds?: Set<string>;
  autoOnly?: boolean;
}

export function matchPage(document: Document, fields: ScannedField[], profile: ResumeProfile, mappings: FieldMapping[] = []): PageMatchResult {
  const adapter = detectAdapter({ hostname: document.location?.hostname ?? "local.page", document });
  return { fields, matches: matchFields(fields, profile, mappings), adapterId: adapter.id, adapterName: adapter.displayName };
}

function labelFor(match: FieldMatch): string {
  return match.descriptor.label || match.descriptor.name || match.descriptor.placeholder || match.descriptor.tag;
}

function resultForMatch(match: FieldMatch, status: FillResult["status"], reason: string): FillResult {
  return {
    fieldId: match.descriptor.id,
    label: labelFor(match),
    profileKey: match.candidate?.profileKey,
    status,
    reason,
    sensitiveReview: match.sensitiveReview,
    descriptor: match.descriptor
  };
}

function executeOne(match: FieldMatch, field: ScannedField, profile: ResumeProfile, options: ExecuteOptions): FillResult {
  if (!match.candidate) return resultForMatch(match, "NO_MATCH", "没有足够可靠的资料匹配");
  if (!field.element.isConnected) return resultForMatch(match, "FAILED", "页面结构已变化，字段已脱离文档，请重新扫描");
  if (match.decision === "EXISTING" && !options.overwriteExisting) return resultForMatch(match, "SKIPPED", "已有内容，默认不覆盖");
  const eligibleAuto = match.decision === "AUTO" || (match.decision === "EXISTING" && options.overwriteExisting && match.score >= 80);
  if (options.autoOnly && !eligibleAuto) {
    if (match.decision === "SUGGEST") return resultForMatch(match, "UNCERTAIN", "中等置信度，等待用户确认");
    if (match.decision === "ABSTAIN") return resultForMatch(match, "UNCERTAIN", match.reason === "LOW_CONFIDENCE" ? "置信度不足，未自动填写" : "没有可靠匹配");
    return resultForMatch(match, "MANUAL_REQUIRED", "需要人工处理");
  }
  if (match.decision === "SUGGEST" && !options.selectedFieldIds?.has(field.id)) return resultForMatch(match, "UNCERTAIN", "中等置信度，等待用户确认");
  const value = resolveProfileValue(profile, match.candidate.profileKey) || match.candidate.value;
  if (!compactText(value)) return resultForMatch(match, "NO_MATCH", "Profile 中没有可填写的值");
  if (!options.overwriteExisting && hasExistingValue(field.element)) return resultForMatch(match, "SKIPPED", "已有内容，默认不覆盖");
  try {
    fillElement(field.element, value, options.overwriteExisting);
    if (!verifyElement(field.element, value)) return {
      ...resultForMatch(match, "FAILED", "填写后复核失败"),
      expected: match.sensitiveReview ? maskSensitiveValue(value) : value,
      actual: match.sensitiveReview ? maskSensitiveValue(readActual(field)) : readActual(field)
    };
    return {
      ...resultForMatch(match, "FILLED", match.sensitiveReview ? "已填写，请重点复核敏感字段" : "填写并复核成功"),
      expected: match.sensitiveReview ? maskSensitiveValue(value) : value,
      actual: match.sensitiveReview ? maskSensitiveValue(readActual(field)) : readActual(field)
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : "控件拒绝填写";
    const status: FillResult["status"] = message.includes("manual") || message.includes("Sensitive") ? "MANUAL_REQUIRED" : message.includes("Existing") ? "SKIPPED" : "FAILED";
    return resultForFailure(field, status, message);
  }
}

function readActual(field: ScannedField): string {
  const element = field.element;
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value;
  return element.textContent?.trim() ?? "";
}

export function executeMatches(page: PageMatchResult, profile: ResumeProfile, options: ExecuteOptions): FillReport {
  const fieldsById = new Map(page.fields.map((field) => [field.id, field]));
  const results = page.matches.map((match) => {
    const field = fieldsById.get(match.descriptor.id);
    if (!field) return resultForMatch(match, "FAILED", "页面结构已变化，请重新扫描");
    return executeOne(match, field, profile, options);
  });
  return {
    hostname: page.fields[0]?.hostname ?? "local.page",
    scanned: page.fields.length,
    autoCandidates: page.matches.filter((match) => match.decision === "AUTO").length,
    suggestions: page.matches.filter((match) => match.decision === "SUGGEST").length,
    abstained: page.matches.filter((match) => match.decision === "ABSTAIN").length,
    results,
    generatedAt: new Date().toISOString()
  };
}
