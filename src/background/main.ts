import { forgetAllMappings, forgetMapping, mappingsAfterSuccessfulReport } from "../shared/mapping";
import type { ExtensionMessage, FillResponse, ScanResponse, StatusResponse } from "../shared/messages";
import { loadMappings, loadProfile, loadSettings, localStorageArea, saveMappings, saveSettings } from "../shared/storage";
import type { FieldMapping, FillReport } from "../shared/types";

async function activeTabId(): Promise<number> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  const tabId = tabs[0]?.id;
  if (typeof tabId !== "number") throw new Error("没有可操作的当前页面");
  return tabId;
}

async function ensureContentScript(tabId: number): Promise<void> {
  await chrome.scripting.executeScript({ target: { tabId }, files: ["content.js"] });
}

async function sendToActiveTab<T>(message: Record<string, unknown>): Promise<T> {
  const tabId = await activeTabId();
  try {
    return await chrome.tabs.sendMessage(tabId, message) as T;
  } catch {
    await ensureContentScript(tabId);
    return await chrome.tabs.sendMessage(tabId, message) as T;
  }
}

function publicError(error: unknown): string {
  if (error instanceof Error && error.message.includes("Cannot access")) return "当前页面不允许扩展访问，请换到普通网页后重试";
  return error instanceof Error ? error.message : "操作未完成，请重试";
}

async function saveConfirmedMapping(report: FillReport, mappings: FieldMapping[]): Promise<void> {
  const next = mappingsAfterSuccessfulReport(mappings, report);
  if (next !== mappings) await saveMappings(next);
}

async function handleMessage(message: ExtensionMessage): Promise<ScanResponse | FillResponse | StatusResponse> {
  const area = localStorageArea();
  if (message.type === "GET_STATUS") {
    const [profile, mappings, settings] = await Promise.all([loadProfile(area), loadMappings(area), loadSettings(area)]);
    return { ok: true, profile, mappingsCount: mappings.length, settings };
  }
  if (message.type === "SAVE_SETTINGS") {
    await saveSettings(message.settings, area);
    return { ok: true };
  }
  if (message.type === "CLEAR_LOCAL_DATA") {
    await area.clear();
    return { ok: true };
  }
  if (message.type === "FORGET_MAPPINGS") {
    const mappings = await loadMappings(area);
    const next = message.hostname ? mappings.filter((mapping) => mapping.hostname !== message.hostname) : forgetAllMappings();
    await saveMappings(next, area);
    return { ok: true };
  }
  if (message.type === "FORGET_MAPPING") {
    const mappings = await loadMappings(area);
    await saveMappings(forgetMapping(mappings, message.mappingId), area);
    return { ok: true };
  }
  if (message.type === "SCAN_PAGE") {
    const mappings = await loadMappings(area);
    const response = await sendToActiveTab<ScanResponse>({ ...message, type: "SCAN_PAGE", mappings });
    return response;
  }

  const response = await sendToActiveTab<FillResponse>({ ...message });
  if (response.ok && response.report && message.type === "FILL_SELECTED_SUGGESTION") {
    const mappings = await loadMappings(area);
    await saveConfirmedMapping(response.report, mappings);
  }
  return response;
}

chrome.runtime.onMessage.addListener((message: ExtensionMessage, sender, sendResponse) => {
  if (sender.id && sender.id !== chrome.runtime.id) {
    sendResponse({ ok: false, error: "拒绝非本扩展消息" });
    return false;
  }
  void handleMessage(message)
    .then((response) => sendResponse(response))
    .catch((error: unknown) => sendResponse({ ok: false, error: publicError(error) }));
  return true;
});
