import { compactText, normalizeText } from "./normalize";
import type { FillResult, FormElement, ScannedField } from "./types";

function dispatchValueEvents(element: FormElement): void {
  const document = element.ownerDocument;
  const inputEvent = typeof InputEvent === "function"
    ? new InputEvent("input", { bubbles: true, composed: true, inputType: "insertText", data: null })
    : new Event("input", { bubbles: true, composed: true });
  element.dispatchEvent(inputEvent);
  element.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
  element.dispatchEvent(new Event("blur", { bubbles: true, composed: true }));
  void document;
}

function setNativeValue(element: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, "value");
  if (!descriptor?.set) throw new Error("Native value setter is unavailable");
  descriptor.set.call(element, value);
  dispatchValueEvents(element);
}

function normalizedDateForInput(value: string, type: string): string | undefined {
  const trimmed = compactText(value);
  if (type === "date" && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (type === "month" && /^\d{4}-\d{2}$/.test(trimmed)) return trimmed;
  if (type === "date" && /^\d{4}-\d{2}$/.test(trimmed)) return `${trimmed}-01`;
  if (type === "month" && /^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed.slice(0, 7);
  return undefined;
}

function fillSelect(element: HTMLSelectElement, expected: string): void {
  const target = normalizeText(expected);
  const exact = Array.from(element.options).filter((option) => normalizeText(option.value) === target || normalizeText(option.textContent) === target);
  const selected = exact[0];
  if (exact.length !== 1 || !selected) throw new Error(exact.length === 0 ? "No exact select option" : "Ambiguous select options");
  element.value = selected.value;
  dispatchValueEvents(element);
}

function readValue(element: FormElement): string {
  if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement || element instanceof HTMLSelectElement) return element.value;
  return element.textContent?.trim() ?? "";
}

export function hasExistingValue(element: FormElement): boolean {
  return compactText(readValue(element)).length > 0;
}

export function fillElement(element: FormElement, expected: string, overwriteExisting = false): void {
  if (element instanceof HTMLInputElement) {
    if (["file", "password", "checkbox", "radio"].includes(element.type)) throw new Error("Sensitive or interactive control requires manual handling");
    if (element.readOnly) throw new Error("Readonly field");
    if (!overwriteExisting && hasExistingValue(element)) throw new Error("Existing value is protected");
    const value = ["date", "month"].includes(element.type) ? normalizedDateForInput(expected, element.type) : expected;
    if (value === undefined) throw new Error("Date format is not supported by this control");
    setNativeValue(element, value);
    return;
  }
  if (element instanceof HTMLTextAreaElement) {
    if (element.readOnly) throw new Error("Readonly field");
    if (!overwriteExisting && hasExistingValue(element)) throw new Error("Existing value is protected");
    setNativeValue(element, expected);
    return;
  }
  if (element instanceof HTMLSelectElement) {
    if (element.disabled) throw new Error("Disabled field");
    if (!overwriteExisting && hasExistingValue(element)) throw new Error("Existing value is protected");
    fillSelect(element, expected);
    return;
  }
  if (element.getAttribute("contenteditable") === "true") {
    if (element.getAttribute("aria-readonly") === "true") throw new Error("Readonly field");
    if (!overwriteExisting && hasExistingValue(element)) throw new Error("Existing value is protected");
    element.textContent = expected;
    dispatchValueEvents(element);
    return;
  }
  throw new Error("Unsupported control");
}

export function verifyElement(element: FormElement, expected: string): boolean {
  const actual = readValue(element);
  if (element instanceof HTMLSelectElement) return normalizeText(actual) === normalizeText(expected) || normalizeText(element.selectedOptions[0]?.textContent) === normalizeText(expected);
  return actual === expected;
}

export function resultForFailure(field: ScannedField, status: FillResult["status"], reason: string): FillResult {
  return { fieldId: field.id, label: field.label || field.name || field.placeholder || field.tag, status, reason, descriptor: field };
}
