import { hashFingerprint } from "./ids";
import { compactText, isPlaceholderText, normalizeText } from "./normalize";
import type { FieldCapability, FormElement, ScannedField } from "./types";

const CONTROL_SELECTOR = [
  "input",
  "textarea",
  "select",
  "[contenteditable]:not([contenteditable='false'])",
  "[role='textbox']",
  "[role='combobox']",
  "[role='spinbutton']",
  "[aria-haspopup='listbox']"
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
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute("disabled") || current.getAttribute("aria-disabled") === "true" || current.matches("fieldset[disabled]")) return true;
    current = composedParent(current);
  }
  return false;
}

function isHidden(element: Element): boolean {
  const ownerWindow = element.ownerDocument.defaultView;
  let current: Element | null = element;
  while (current) {
    if (current.hasAttribute("hidden") || current.getAttribute("aria-hidden") === "true") return true;
    const styles = ownerWindow?.getComputedStyle(current);
    if (styles && (styles.display === "none" || styles.visibility === "hidden" || styles.visibility === "collapse")) return true;
    current = composedParent(current);
  }
  return false;
}

function isPluginElement(element: Element): boolean {
  let current: Element | null = element;
  while (current) {
    if (current.matches("[data-resume-autofiller-root='true']")) return true;
    current = composedParent(current);
  }
  return false;
}

function pushUnique(target: string[], value: string | null | undefined): void {
  const text = compactText(value);
  if (text && !target.includes(text)) target.push(text);
}

function labelledByText(element: Element): string {
  const ids = (element.getAttribute("aria-labelledby") ?? "").split(/\s+/).filter(Boolean);
  const values: string[] = [];
  const root = element.getRootNode();
  const lookup = (id: string): Element | undefined => (root.nodeType === 9 || root.nodeType === 11 ? Array.from((root as Document | ShadowRoot).querySelectorAll("[id]")).find((candidate) => candidate.id === id) : undefined);
  for (const id of ids) pushUnique(values, lookup(id)?.textContent);
  return values.join(" ");
}

function rootLabels(element: Element): HTMLLabelElement[] {
  const root = element.getRootNode();
  return root.nodeType === 9 || root.nodeType === 11 ? Array.from((root as Document | ShadowRoot).querySelectorAll("label")) : [];
}

function nearestFormItem(element: Element): Element | null {
  let current = element.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    const className = typeof current.className === "string" ? current.className : "";
    if (/(^|\s)(?:[\w-]+-)?form[-_]?item(?:\s|$)/i.test(className) || /(^|\s)(?:[\w-]+-)?form[-_]?group(?:\s|$)/i.test(className) || /(^|\s)(?:[\w-]+-)?field[-_]?group(?:\s|$)/i.test(className)) return current;
  }
  return null;
}

function nearbyLabel(element: Element): string {
  const values: string[] = [];
  const explicitLabels = "labels" in element ? (element as HTMLInputElement).labels : null;
  for (const label of explicitLabels ?? []) pushUnique(values, label.textContent);
  pushUnique(values, element.getAttribute("aria-label"));
  pushUnique(values, labelledByText(element));
  const id = element.getAttribute("id");
  if (id) {
    const explicit = rootLabels(element).find((label) => label.htmlFor === id);
    pushUnique(values, explicit?.textContent);
  }
  pushUnique(values, element.closest("label")?.textContent);

  const formItem = nearestFormItem(element) ?? element.closest("[role='group']");
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
  for (let depth = 0; current && depth < 8; depth += 1, current = composedParent(current)) {
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

function composedParent(element: Element): Element | null {
  if (element.parentElement) return element.parentElement;
  const root = element.getRootNode();
  return root.nodeType === 11 ? (root as ShadowRoot).host : null;
}

function capabilityFor(element: Element): FieldCapability {
  const tagName = element.tagName.toLowerCase();
  if (["a", "area", "button", "label", "summary"].includes(tagName) || ["submit", "button", "reset", "image"].includes(element.getAttribute("type")?.toLocaleLowerCase() ?? "")) return "unsupported";
  const role = element.getAttribute("role");
  if (["spinbutton", "slider", "button", "checkbox", "radio"].includes(role ?? "")) return "unsupported";
  if (role === "combobox" || element.getAttribute("aria-haspopup") === "listbox") return "select";
  if (element instanceof HTMLSelectElement) return element.multiple ? "unsupported" : "select";
  if (element instanceof HTMLTextAreaElement) return "textarea";
  const contenteditable = element.getAttribute("contenteditable");
  if (contenteditable !== null && contenteditable !== "false") return "contenteditable";
  if (element instanceof HTMLInputElement) {
    if (["hidden", "submit", "button", "reset"].includes(element.type)) return "unsupported";
    return ["text", "email", "tel", "number", "date", "month", "search", "url"].includes(element.type) ? "text" : "unsupported";
  }
  if (element.getAttribute("role") === "textbox" || element.getAttribute("role") === "spinbutton") return "unsupported";
  return "unsupported";
}

function currentValue(element: Element): string {
  if (element instanceof HTMLInputElement && element.type === "password") return "";
  if (element.getAttribute("role") === "combobox" || element.getAttribute("aria-haspopup") === "listbox") {
    const nestedValue = element.querySelector<HTMLInputElement | HTMLTextAreaElement>("input, textarea")?.value ?? "";
    const semanticValues = [element.getAttribute("aria-valuetext"), element.getAttribute("data-value"), element instanceof HTMLInputElement ? element.value : "", nestedValue];
    const semanticValue = semanticValues.find((value) => !isPlaceholderText(value));
    if (semanticValue) return semanticValue;
    const visibleText = compactText(element.textContent);
    return isPlaceholderText(visibleText) ? "" : visibleText;
  }
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value;
  return element.textContent?.trim() ?? "";
}

function fieldType(element: Element): string {
  if (element instanceof HTMLInputElement) return element.type || "text";
  if (element instanceof HTMLTextAreaElement) return "textarea";
  if (element instanceof HTMLSelectElement) return element.multiple ? "select-multiple" : "select";
  if (element.getAttribute("role") === "combobox" || element.getAttribute("aria-haspopup") === "listbox") return "combobox";
  if (element.getAttribute("contenteditable") !== null && element.getAttribute("contenteditable") !== "false") return "contenteditable";
  return element.getAttribute("role") || (element.getAttribute("contenteditable") === "true" ? "contenteditable" : element.tagName.toLowerCase());
}

function repeatRowOccurrence(element: Element, section: string): number | undefined {
  const fieldset = element.closest("fieldset");
  if (fieldset) {
    const fieldsets = Array.from(element.ownerDocument.querySelectorAll("fieldset")).filter((candidate) => sectionFor(candidate, candidate.querySelector("legend")?.textContent ?? "").section === section);
    const index = fieldsets.indexOf(fieldset);
    if (index >= 0 && fieldsets.length > 1) return index;
  }
  let current: Element | null = element.parentElement;
  for (let depth = 0; current && depth < 6; depth += 1, current = current.parentElement) {
    const className = typeof current.className === "string" ? current.className : "";
    if (!/(entry|record|experience|education|project|research|award|row|card)/i.test(className) || /form[-_]?item|form[-_]?group/i.test(className)) continue;
    const parent = current.parentElement;
    if (!parent) continue;
    const currentTag = current.tagName;
    const currentClass = className;
    const peers = Array.from(parent.children).filter((candidate) => {
      const candidateClass = typeof candidate.className === "string" ? candidate.className : "";
      return candidate.tagName === currentTag && candidateClass === currentClass && candidate.querySelector(CONTROL_SELECTOR);
    });
    const index = peers.indexOf(current);
    if (peers.length > 1 && index >= 0) return index;
  }
  return undefined;
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

function isNestedInSemanticSelect(element: Element): boolean {
  const semanticAncestor = element.parentElement?.closest("[role='combobox'], [aria-haspopup='listbox']");
  return Boolean(semanticAncestor && semanticAncestor !== element);
}

export function fieldFingerprint(field: Pick<ScannedField, "hostname" | "domId" | "role" | "ariaLabel" | "ariaLabelledBy" | "label" | "name" | "placeholder" | "section" | "sectionLabel" | "type" | "occurrence">): string {
  return hashFingerprint([
    field.hostname,
    normalizeText(field.domId),
    normalizeText(field.role),
    normalizeText(field.ariaLabel),
    normalizeText(field.ariaLabelledBy),
    normalizeText(field.label),
    normalizeText(field.name),
    normalizeText(field.placeholder),
    normalizeText(field.section),
    normalizeText(field.sectionLabel),
    normalizeText(field.type),
    String(field.occurrence)
  ].join("|"));
}

export function scanDocument(document: Document, hostname = document.location?.hostname ?? "local.page"): ScannedField[] {
  const fields: ScannedField[] = [];
  const occurrenceBySignature = new Map<string, number>();
  for (const element of allControls(document)) {
    if (!isElement(element) || isNestedInSemanticSelect(element) || isHidden(element) || isPluginElement(element) || isDisabled(element)) continue;
    const type = fieldType(element);
    if (["hidden", "submit", "button", "reset"].includes(type)) continue;
    const label = nearbyLabel(element);
    const { section, sectionLabel } = sectionFor(element, label);
    const name = element.getAttribute("name") ?? "";
    const placeholder = element.getAttribute("placeholder") ?? "";
    const signature = `${section}|${normalizeText(label || name || placeholder).replace(/\d+/g, "")}`;
    const repeatedOccurrence = repeatRowOccurrence(element, section);
    const occurrence = repeatedOccurrence ?? (occurrenceBySignature.get(signature) ?? 0);
    occurrenceBySignature.set(signature, Math.max(occurrenceBySignature.get(signature) ?? 0, occurrence + 1));
    const descriptorBase = {
      id: `rf-field-${fields.length + 1}`,
      tag: element.tagName.toLowerCase(),
      type,
      domId: element.getAttribute("id") ?? "",
      role: element.getAttribute("role") ?? "",
      ariaLabel: element.getAttribute("aria-label") ?? "",
      ariaLabelledBy: element.getAttribute("aria-labelledby") ?? "",
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
