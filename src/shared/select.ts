import { compactText, normalizeText } from "./normalize";
import type { OptionDescriptor, SelectDriver, SelectResult } from "./types";

const OPTION_SELECTORS = [
  "[role='option']",
  ".ant-select-item-option",
  ".el-select-dropdown__item",
  "[data-resume-option]"
].join(",");

function isVisible(element: Element): boolean {
  if (element.hasAttribute("hidden") || element.getAttribute("aria-hidden") === "true") return false;
  if (element.closest("[hidden], [aria-hidden='true']")) return false;
  const styles = element.ownerDocument.defaultView?.getComputedStyle(element);
  return !(styles && (styles.display === "none" || styles.visibility === "hidden" || styles.visibility === "collapse"));
}

function optionLabel(element: HTMLElement): string {
  return compactText(element.getAttribute("data-label") || element.textContent || element.getAttribute("aria-label"));
}

function optionValue(element: HTMLElement): string {
  return compactText(element.getAttribute("data-value") || element.getAttribute("value") || optionLabel(element));
}

function optionSelected(element: HTMLElement): boolean {
  return element.getAttribute("aria-selected") === "true" || element.classList.contains("is-selected") || element.classList.contains("ant-select-item-option-selected");
}

function optionsIn(root: Element): HTMLElement[] {
  const result: HTMLElement[] = [];
  if (root instanceof HTMLElement && root.matches(OPTION_SELECTORS)) result.push(root);
  result.push(...Array.from(root.querySelectorAll<HTMLElement>(OPTION_SELECTORS)));
  return result;
}

function relatedOptionRoots(element: HTMLElement): Element[] {
  const document = element.ownerDocument;
  const roots: Element[] = [];
  const ids = [element.getAttribute("aria-controls"), element.getAttribute("aria-owns")]
    .flatMap((value) => (value ?? "").split(/\s+/))
    .filter(Boolean);
  for (const id of ids) {
    const target = document.getElementById(id);
    if (target && isVisible(target)) roots.push(target);
  }

  const componentSelectors = element.closest(".ant-select, .ant-select-selector")
    ? [".ant-select-dropdown"]
    : element.closest(".el-select, .el-input")
      ? [".el-select-dropdown"]
      : [];
  for (const selector of componentSelectors) {
    for (const popup of Array.from(document.querySelectorAll<HTMLElement>(selector))) if (isVisible(popup)) roots.push(popup);
  }

  if (roots.length === 0) {
    const visibleListboxes = Array.from(document.querySelectorAll<HTMLElement>("[role='listbox']")).filter(isVisible);
    if (visibleListboxes.length === 1) roots.push(visibleListboxes[0]!);
  }
  return Array.from(new Set(roots));
}

function collectOptions(element: HTMLElement): OptionDescriptor[] {
  const roots = relatedOptionRoots(element);
  let candidates: HTMLElement[];
  if (roots.length > 0) {
    candidates = roots.flatMap((root) => optionsIn(root));
  } else {
    candidates = [];
  }
  const options = Array.from(new Set(candidates))
    .filter((option) => isVisible(option) && !option.closest("[data-resume-autofiller-root='true']"));
  return options.map((option) => ({ label: optionLabel(option), value: optionValue(option), selected: optionSelected(option), element: option }));
}

function controlState(element: HTMLElement): string[] {
  const values: string[] = [];
  for (const attribute of ["aria-valuetext", "data-value", "value"]) {
    const value = element.getAttribute(attribute);
    if (value) values.push(value);
  }
  if ("value" in element && typeof (element as HTMLInputElement).value === "string") values.push((element as HTMLInputElement).value);
  for (const control of Array.from(element.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("input, textarea"))) values.push(control.value);
  values.push(element.textContent || "");
  return values.map(normalizeText).filter(Boolean);
}

function verifySelection(element: HTMLElement, expected: string, option: OptionDescriptor): boolean {
  const target = normalizeText(expected);
  const states = controlState(element);
  const controlMatches = states.some((value) => value === target || value.includes(target));
  if (!controlMatches) return false;
  if (optionSelected(option.element) && (normalizeText(option.label) === target || normalizeText(option.value) === target)) return true;
  const activeId = element.getAttribute("aria-activedescendant");
  if (activeId && element.ownerDocument.getElementById(activeId) === option.element) return true;
  return normalizeText(option.label) === target || normalizeText(option.value) === target;
}

async function waitForOptions(element: HTMLElement): Promise<OptionDescriptor[]> {
  const deadline = Date.now() + 700;
  let options = collectOptions(element);
  while (options.length === 0 && Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 20));
    options = collectOptions(element);
  }
  return options;
}

class DomSelectDriver implements SelectDriver {
  public constructor(
    public readonly id: string,
    private readonly controlPredicate: (element: HTMLElement) => boolean
  ) {}

  public canHandle(element: HTMLElement): boolean {
    return this.controlPredicate(element);
  }

  public async select(element: HTMLElement, expected: string): Promise<SelectResult> {
    if (!element.isConnected) return { status: "FAILED", reason: "页面结构已经变化，请重新扫描" };
    element.focus();
    if (!element.isConnected) return { status: "FAILED", reason: "页面结构已经变化，请重新扫描" };
    element.click();
    const options = await waitForOptions(element);
    const target = normalizeText(expected);
    const exact = options.filter((option) => normalizeText(option.label) === target || normalizeText(option.value) === target);
    const option = exact[0];
    if (exact.length !== 1 || !option) return { status: "MANUAL_REQUIRED", reason: exact.length === 0 ? "没有唯一精确下拉选项，需人工处理" : "AMBIGUOUS_OPTION：下拉选项存在歧义，未自动选择" };
    if (!option.element.isConnected) return { status: "FAILED", reason: "下拉选项在选择前已经变化，请重新扫描" };
    option.element.click();
    await Promise.resolve();
    if (!verifySelection(element, expected, option)) return { status: "FAILED", reason: "下拉选择后复核失败" };
    return { status: "FILLED", reason: "下拉选择并复核成功", actual: option.label || option.value };
  }
}

const DRIVERS: SelectDriver[] = [
  new DomSelectDriver("ant-select", (element) => Boolean(element.closest(".ant-select, .ant-select-selector"))),
  new DomSelectDriver("element-select", (element) => Boolean(element.closest(".el-select, .el-input"))),
  new DomSelectDriver("aria-combobox", (element) => element.getAttribute("role") === "combobox" || element.getAttribute("aria-haspopup") === "listbox")
];

export function selectDriverFor(element: HTMLElement): SelectDriver | undefined {
  const tagName = element.tagName.toLowerCase();
  const type = element.getAttribute("type")?.toLocaleLowerCase();
  if (tagName === "button" || ["submit", "button", "reset"].includes(type ?? "")) return undefined;
  return DRIVERS.find((driver) => driver.canHandle(element));
}
