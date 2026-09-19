import { detectAdapter } from "./adapters";
import { compactText, maskSensitiveValue } from "./normalize";
import { resolveProfileValue } from "./profile";
import { fillElement, hasExistingValue, resultForFailure, verifyElement } from "./executor";
import { matchFields } from "./matcher";
import { scanDocument } from "./scanner";
import { selectDriverFor } from "./select";
import type { FieldMapping, FieldMatch, FillReport, FillResult, ResumeProfile, ScannedField } from "./types";

export interface PageMatchResult {
  fields: ScannedField[];
  matches: FieldMatch[];
  adapterId: string;
  adapterName: string;
  document?: Document;
}

export interface ExecuteOptions {
  overwriteExisting: boolean;
  selectedFieldIds?: Set<string>;
  autoOnly?: boolean;
}

export function matchPage(document: Document, fields: ScannedField[], profile: ResumeProfile, mappings: FieldMapping[] = []): PageMatchResult {
  const adapter = detectAdapter({ hostname: document.location?.hostname ?? "local.page", document });
  return { fields, matches: matchFields(fields, profile, mappings), adapterId: adapter.id, adapterName: adapter.displayName, document };
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

async function executeOne(match: FieldMatch, field: ScannedField, profile: ResumeProfile, options: ExecuteOptions): Promise<FillResult> {
  if (!field.element.isConnected) return resultForMatch(match, "FAILED", "页面结构已变化，字段已脱离文档，请重新扫描");
  if (match.decision === "ABSTAIN") return resultForMatch(match, "UNCERTAIN", match.reason === "LOW_CONFIDENCE" ? "置信度不足，未自动填写" : "没有可靠匹配");
  if (match.decision === "MANUAL") return resultForMatch(match, "MANUAL_REQUIRED", "该控件必须人工处理");
  if (!match.candidate) return resultForMatch(match, "NO_MATCH", "没有足够可靠的资料匹配");
  if (match.decision === "EXISTING" && !options.overwriteExisting) return resultForMatch(match, "SKIPPED", "已有内容，默认不覆盖");
  const eligibleAuto = match.decision === "AUTO" || (match.decision === "EXISTING" && options.overwriteExisting && match.score >= 80);
  if (options.autoOnly && !eligibleAuto) {
    if (match.decision === "SUGGEST") return resultForMatch(match, "UNCERTAIN", "中等置信度，等待用户确认");
    return resultForMatch(match, "MANUAL_REQUIRED", "需要人工处理");
  }
  if (match.decision === "SUGGEST" && !options.selectedFieldIds?.has(field.id)) return resultForMatch(match, "UNCERTAIN", "中等置信度，等待用户确认");
  const value = resolveProfileValue(profile, match.candidate.profileKey) || match.candidate.value;
  if (!compactText(value)) return resultForMatch(match, "NO_MATCH", "Profile 中没有可填写的值");
  if (!options.overwriteExisting && hasExistingValue(field.element)) return resultForMatch(match, "SKIPPED", "已有内容，默认不覆盖");
  try {
    if (field.fillCapability === "select" && !(field.element instanceof HTMLSelectElement)) {
      const driver = selectDriverFor(field.element as HTMLElement);
      if (!driver) return resultForMatch(match, "MANUAL_REQUIRED", "未识别的自定义下拉控件");
      const selectResult = await driver.select(field.element as HTMLElement, value);
      if (selectResult.status !== "FILLED") return resultForMatch(match, selectResult.status, selectResult.reason);
      return {
        ...resultForMatch(match, "FILLED", selectResult.reason),
        expected: match.sensitiveReview ? maskSensitiveValue(value) : value,
        actual: match.sensitiveReview ? maskSensitiveValue(selectResult.actual ?? value) : (selectResult.actual ?? value)
      };
    }
    fillElement(field.element, value, options.overwriteExisting);
    if (!field.element.isConnected) return resultForMatch(match, "FAILED", "填写事件改变了页面结构，请重新扫描");
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

export async function executeMatches(page: PageMatchResult, profile: ResumeProfile, options: ExecuteOptions): Promise<FillReport> {
  const results: FillResult[] = [];
  const successful = new Map<string, { match: FieldMatch; field: ScannedField; resultIndex: number }>();
  for (const match of page.matches) {
    const liveFields = page.document ? scanDocument(page.document, page.fields[0]?.hostname ?? page.document.location?.hostname ?? "local.page") : page.fields;
    const liveFieldsByElement = new Map(liveFields.map((field) => [field.element, field]));
    const plannedField = page.fields.find((field) => field.id === match.descriptor.id);
    const field = plannedField ? liveFieldsByElement.get(plannedField.element) : undefined;
    if (!field) {
      results.push(resultForMatch(match, "FAILED", "页面结构已变化，请重新扫描"));
      continue;
    }
    if (field.fingerprint !== match.descriptor.fingerprint) {
      results.push(resultForMatch(match, "FAILED", "字段标签或控件属性已变化，请重新扫描"));
      continue;
    }
    const result = await executeOne(match, field, profile, options);
    results.push(result);
    if (result.status === "FILLED" && page.document) {
      const postEventFields = scanDocument(page.document, field.hostname);
      const postEventField = postEventFields.find((candidate) => candidate.element === field.element);
      if (!postEventField || postEventField.fingerprint !== match.descriptor.fingerprint) {
        results[results.length - 1] = resultForMatch(match, "FAILED", "填写事件改变了字段语义，请重新扫描");
      } else {
        successful.set(field.id, { match, field, resultIndex: results.length - 1 });
      }
    }
    if (page.document && successful.size > 0) {
      const currentFields = scanDocument(page.document, field.hostname);
      for (const [fieldId, state] of successful) {
        const current = currentFields.find((candidate) => candidate.element === state.field.element);
        if (current && current.fingerprint === state.match.descriptor.fingerprint) continue;
        results[state.resultIndex] = resultForMatch(state.match, "FAILED", "此前填写的字段语义在后续事件中发生变化，未继续写入；请人工检查原字段");
        successful.delete(fieldId);
      }
    }
  }
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
