import { executeMatches, matchPage, type PageMatchResult } from "../shared/engine";
import { createStableId } from "../shared/ids";
import { scanDocument } from "../shared/scanner";
import type { ExtensionMessage } from "../shared/messages";
import type { FillReport, FieldMatch } from "../shared/types";

let session: PageMatchResult | null = null;
let sessionId = "";
let sessionDirty = false;
let observer: MutationObserver | null = null;

function toPublicMatch(match: FieldMatch): FieldMatch {
  const descriptor = { ...match.descriptor } as FieldMatch["descriptor"] & { element?: unknown };
  delete descriptor.element;
  return {
    ...match,
    descriptor
  };
}

function toPublicReport(report: FillReport): FillReport {
  return {
    ...report,
    results: report.results.map((result) => {
      const descriptor = result.descriptor ? { ...result.descriptor } as FillReport["results"][number]["descriptor"] & { element?: unknown } : undefined;
      if (descriptor) delete descriptor.element;
      return { ...result, descriptor };
    })
  };
}

function overlay(): ShadowRoot {
  let host = document.querySelector<HTMLElement>("[data-resume-autofiller-root='true']");
  if (!host) {
    host = document.createElement("div");
    host.dataset.resumeAutofillerRoot = "true";
    host.setAttribute("data-resume-autofiller-root", "true");
    document.documentElement.append(host);
  }
  return host.shadowRoot ?? host.attachShadow({ mode: "open" });
}

function showOverlay(report: FillReport): void {
  const root = overlay();
  while (root.firstChild) root.removeChild(root.firstChild);
  const style = document.createElement("style");
  style.textContent = `
    :host { all: initial; }
    .panel { position: fixed; z-index: 2147483647; right: 20px; bottom: 20px; width: 320px; max-height: 55vh; overflow: auto; padding: 16px; border: 1px solid #d9e1ec; border-radius: 14px; background: #fff; color: #172033; box-shadow: 0 12px 40px rgba(20,35,60,.2); font: 14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif; }
    h3 { margin: 0 0 8px; font-size: 16px; } p { margin: 6px 0; } ul { padding: 0; margin: 10px 0 0; list-style: none; } li { padding: 6px 0; border-top: 1px solid #edf0f5; } .filled { color: #16803c; } .manual { color: #a25a00; } .failed { color: #ba2d2d; } button { float: right; border: 0; background: transparent; color: #315b9a; cursor: pointer; font-size: 16px; }
  `;
  root.append(style);
  const panel = document.createElement("section");
  panel.className = "panel";
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = "×";
  close.setAttribute("aria-label", "关闭结果");
  close.addEventListener("click", () => panel.remove());
  panel.append(close);
  const heading = document.createElement("h3");
  heading.textContent = "ResumeAutoFiller 填写结果";
  panel.append(heading);
  const summary = document.createElement("p");
  const filled = report.results.filter((result) => result.status === "FILLED").length;
  const attention = report.results.filter((result) => ["UNCERTAIN", "MANUAL_REQUIRED", "SKIPPED"].includes(result.status)).length;
  summary.textContent = `已填写 ${filled} 项，仍需关注 ${attention} 项，失败 ${report.results.filter((result) => result.status === "FAILED").length} 项。`;
  panel.append(summary);
  const list = document.createElement("ul");
  for (const result of report.results.filter((item) => item.status !== "FILLED").slice(0, 12)) {
    const item = document.createElement("li");
    item.className = result.status === "FAILED" ? "failed" : result.status === "MANUAL_REQUIRED" ? "manual" : "";
    item.textContent = `${result.label}：${result.reason}`;
    list.append(item);
  }
  panel.append(list);
  root.append(panel);
}

function installObserver(): void {
  observer?.disconnect();
  observer = new MutationObserver((records) => {
    const pageChanged = records.some((record) => {
      if (record.target instanceof Element && record.target.closest("[data-resume-autofiller-root='true']")) return false;
      const onlyOverlayNodes = Array.from(record.addedNodes).length > 0 && Array.from(record.addedNodes).every((node) => node instanceof Element && node.matches("[data-resume-autofiller-root='true']"));
      return !onlyOverlayNodes;
    });
    if (pageChanged) sessionDirty = true;
  });
  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["value", "disabled", "class", "style", "name", "type", "hidden", "aria-hidden", "aria-label", "aria-labelledby", "readonly", "aria-readonly", "placeholder", "required"]
  });
}

function errorResponse(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

async function handleMessage(message: ExtensionMessage): Promise<unknown> {
  if (message.type === "SCAN_PAGE") {
    const fields = scanDocument(document, location.hostname || "local.page");
    session = matchPage(document, fields, message.profile, message.mappings);
    sessionId = createStableId("scan");
    sessionDirty = false;
    installObserver();
    return {
      ok: true,
      adapterId: session.adapterId,
      adapterName: session.adapterName,
      sessionId,
      matches: session.matches.map(toPublicMatch),
      scanned: session.fields.length,
      autoCandidates: session.matches.filter((match) => match.decision === "AUTO").length,
      suggestions: session.matches.filter((match) => match.decision === "SUGGEST").length,
      abstained: session.matches.filter((match) => match.decision === "ABSTAIN").length
    };
  }
  if (message.type === "FILL_HIGH_CONFIDENCE") {
    if (!session) return errorResponse("请先扫描当前页面");
    if (sessionDirty) return errorResponse("页面结构已经变化，请重新扫描后再填写");
    const report = executeMatches(session, message.profile, { overwriteExisting: message.overwriteExisting, autoOnly: true });
    showOverlay(report);
    return { ok: true, report: toPublicReport(report) };
  }
  if (message.type === "FILL_SELECTED_SUGGESTION") {
    if (!session) return errorResponse("请先扫描当前页面");
    if (message.sessionId !== sessionId) return errorResponse("扫描结果已经过期，请重新扫描后再确认");
    if (sessionDirty) return errorResponse("页面结构已经变化，请重新扫描后再确认");
    const match = session.matches.find((item) => item.descriptor.id === message.fieldId);
    if (!match) return errorResponse("字段已经变化，请重新扫描");
    const singlePage: PageMatchResult = {
      ...session,
      matches: [match],
      fields: session.fields.filter((field) => field.id === message.fieldId)
    };
    const report = executeMatches(singlePage, message.profile, { overwriteExisting: message.overwriteExisting, selectedFieldIds: new Set([message.fieldId]) });
    showOverlay(report);
    return { ok: true, report: toPublicReport(report) };
  }
  return errorResponse("当前页面不支持此操作");
}

const contentState = globalThis as typeof globalThis & { __resumeAutoFillerInstalled?: boolean };
if (!contentState.__resumeAutoFillerInstalled) {
  chrome.runtime.onMessage.addListener((message: ExtensionMessage, _sender, sendResponse) => {
    void handleMessage(message)
      .then((response) => sendResponse(response))
      .catch(() => sendResponse(errorResponse("页面操作未完成，请重新扫描")));
    return true;
  });
  contentState.__resumeAutoFillerInstalled = true;
}
