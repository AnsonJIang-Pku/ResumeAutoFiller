import { hashFingerprint } from "./ids";
import { compactText, normalizeText } from "./normalize";
import type { FieldCapability, FormElement, ScannedField } from "./types";

const CONTROL_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable='true']",
  "[role='textbox']",
  "[role='combobox']",
  "[role='spinbutton']"
].join(",");

const SECTION_PATTERNS: Array<[string, RegExp]> = [
  ["education", /教育|学历|学业|院校|education|academic|university|school/i],
  ["projects", /项目|project/i],
  ["research", /科研|研究|论文|发表|research|publication|paper/i],
  ["awards", /获奖|奖项|荣誉|award|honou?r/i],
  ["languages", /语言|语种|language/i],
  ["skills", /技能|技术|skill|technology/i],
  ["basic", /基本信息|个人信息|联系方式|personal|basic|contact/i]
];

function isElement(node: Node): node is Element {
  return node.nodeType === Node.ELEMENT_NODE;
}

function isDisabled(element: Element): boolean {
  return element.hasAttribute("disabled") || element.getAttribute("aria-disabled") === "true" || Boolean(element.closest("fieldset[disabled]"));
}

function isHidden(element: Element): boolean {
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return true;
  if (element.closest("[hidden], [aria-hidden='true']")) return true;
  const ownerWindow = element.ownerDocument.defaultView;
  const styles = ownerWindow?.getComputedStyle(element);
  if (styles && (styles.display === "none" || styles.visibility === "hidden" || styles.visibility === "collapse")) return true;
  return false;
}

function isPluginElement(element: Element): boolean {
  return Boolean(element.closest("[data-resume-autofiller-root='true']"));
}

function pushUnique(target: string[], value: string | null | undefined): void {
  const text = compactText(value);
  if (text && !target.includes(text)) target.push(text);
}

function labelledByText(element: Element): string {
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const values: string[] = [];
  for (const id of ids) pushUnique(values, element.ownerDocument.getElementById(id)?.textContent);
  return values.join(" ");
}

function nearbyLabel(element: Element): string {
  const values: string[] = [];
  const explicitLabels = "labels" in element ? (element as HTMLInputElement).labels : null;
  for (const label of explicitLabels ?? []) pushUnique(values, label.textContent);
  pushUnique(values, element.getAttribute("aria-label"));
  pushUnique(values, labelledByText(element));
  const id = element.getAttribute("id");
  if (id) {
    const explicit = Array.from(element.ownerDocument.querySelectorAll("label")).find((label) => label.htmlFor === id);
    pushUnique(values, explicit?.textContent);
  }
  pushUnique(values, element.closest("label")?.textContent);

  const formItem = element.closest("[class*='form-item'], [class*='form_item'], [class*='form-group'], [class*='form_group'], [class*='field-group'], [role='group']");
  if (formItem) {
    pushUnique(values, formItem.querySelector("label, .label, [class*='label']")?.textContent);
    const firstText = Array.from(formItem.childNodes)
      .filter((node) => node !== element && node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent ?? "")
      .join(" ");
    pushUnique(values, firstText);
  }

  const previous = element.previousElementSibling;
  if (previous) pushUnique(values, previous.matches("label, .label, [class*='label']") ? previous.textContent : "");
  pushUnique(values, element.getAttribute("placeholder"));
  pushUnique(values, element.getAttribute("name"));
  pushUnique(values, element.getAttribute("id"));
  return values[0] ?? "";
}

function sectionFromText(text: string): string {
  for (const [section, pattern] of SECTION_PATTERNS) if (pattern.test(text)) return section;
  return "other";
}

function sectionFor(element: Element, label: string): { section: string; sectionLabel: string } {
  let current: Element | null = element;
  for (let depth = 0; current && depth < 8; depth += 1, current = current.parentElement) {
    const heading = current.matches("fieldset")
      ? current.querySelector("legend")
      : current.matches("section, form")
        ? current.querySelector(":scope > legend, :scope > h1, :scope > h2, :scope > h3, :scope > h4, :scope > h5, :scope > h6, :scope > [data-section-title]")
        : null;
    const classHint = current.getAttribute("class") ?? "";
    const text = compactText(heading?.textContent || classHint);
    if (text) {
      const section = sectionFromText(text);
      if (section !== "other") return { section, sectionLabel: text };
    }
  }
  const inferred = sectionFromText(label);
  return { section: inferred, sectionLabel: inferred === "other" ? "" : label };
}

function capabilityFor(element: Element): FieldCapability {
  if (element instanceof HTMLSelectElement || element.getAttribute("role") === "combobox") return "select";
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element.getAttribute("contenteditable") === "true") return "contenteditable";
  if (element instanceof HTMLInputElement) {
    if (["hidden", "submit", "button", "reset"].includes(element.type)) return "unsupported";
    return ["file", "password", "checkbox", "radio"].includes(element.type) ? "unsupported" : "text";
  }
  if (element.getAttribute("role") === "textbox" || element.getAttribute("role") === "spinbutton") return "unsupported";
  return "unsupported";
}

function currentValue(element: Element): string {
  if (element instanceof HTMLInputElement && element.type === "password") return "";
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value;
  return element.textContent?.trim() ?? "";
}

function fieldType(element: Element): string {
  if (element instanceof HTMLInputElement) return element.type || "text";
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return "select";
  return element.getAttribute("role") || (element.getAttribute("contenteditable") === "true" ? "contenteditable" : element.tagName.toLowerCase());
}

function allControls(root: Document | ShadowRoot): Element[] {
  const result: Element[] = [];
  const visit = (container: Document | ShadowRoot): void => {
    for (const element of Array.from(container.querySelectorAll("*"))) {
      if (element.matches(CONTROL_SELECTOR)) result.push(element);
      if (element.shadowRoot) visit(element.shadowRoot);
    }
  };
  visit(root);
  return result;
}

export function fieldFingerprint(field: Pick<ScannedField, "hostname" | "label" | "name" | "placeholder" | "section" | "type" | "occurrence">): string {
  return hashFingerprint([
    field.hostname,
    normalizeText(field.label),
    normalizeText(field.name),
    normalizeText(field.placeholder),
    normalizeText(field.section),
    normalizeText(field.type),
    String(field.occurrence)
  ].join("|"));
}

export function scanDocument(document: Document, hostname = document.location?.hostname ?? "local.page"): ScannedField[] {
  const fields: ScannedField[] = [];
  const occurrenceBySignature = new Map<string, number>();
  for (const element of allControls(document)) {
    if (!isElement(element) || isHidden(element) || isPluginElement(element) || isDisabled(element)) continue;
    const type = fieldType(element);
    if (["hidden", "submit", "button", "reset"].includes(type)) continue;
    const label = nearbyLabel(element);
    const { section, sectionLabel } = sectionFor(element, label);
    const name = element.getAttribute("name") ?? "";
    const placeholder = element.getAttribute("placeholder") ?? "";
    const signature = `${section}|${normalizeText(label || name || placeholder).replace(/\d+/g, "")}`;
    const occurrence = occurrenceBySignature.get(signature) ?? 0;
    occurrenceBySignature.set(signature, occurrence + 1);
    const descriptorBase = {
      id: `rf-field-${fields.length + 1}`,
      tag: element.tagName.toLowerCase(),
      type,
      label,
      name,
      placeholder,
      section,
      sectionLabel,
      occurrence,
      required: element.hasAttribute("required") || element.getAttribute("aria-required") === "true",
      readOnly: (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) ? element.readOnly : element.getAttribute("aria-readonly") === "true",
      currentValue: currentValue(element),
      fillCapability: capabilityFor(element),
      hostname,
      fingerprint: ""
    };
    const fingerprint = fieldFingerprint(descriptorBase);
    fields.push({ ...descriptorBase, fingerprint, element: element as FormElement });
  }
  return fields;
}
