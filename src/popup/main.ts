import type { ExtensionMessage, FillResponse, PublicMatch, ScanResponse, StatusResponse } from "../shared/messages";
import type { FillReport, ResumeProfile, StoredSettings } from "../shared/types";
import { maskSensitiveValue } from "../shared/normalize";
import { buildProfileCandidates } from "../shared/profile";

let profile: ResumeProfile;
let settings: StoredSettings = { overwriteExisting: false };
let matches: PublicMatch[] = [];
let sessionId = "";

const PROFILE_SECTION_LABELS: Record<string, string> = {
  basic: "基本信息",
  education: "教育经历",
  projects: "项目经历",
  research: "科研 / 论文",
  awards: "获奖情况",
  languages: "语言能力",
  skills: "技能",
  custom: "自定义字段"
};

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing popup element: ${id}`);
  return element as T;
};

const statusElement = byId<HTMLParagraphElement>("status");
const matchList = byId<HTMLUListElement>("match-list");
const summaryElement = byId<HTMLElement>("summary");

function setStatus(message: string, error = false): void {
  statusElement.textContent = message;
  statusElement.classList.toggle("error", error);
}

async function send<T>(message: ExtensionMessage): Promise<T> {
  return await chrome.runtime.sendMessage(message) as T;
}

function decisionLabel(match: PublicMatch): string {
  if (match.decision === "AUTO") return "高置信度";
  if (match.decision === "SUGGEST") return "建议确认";
  if (match.decision === "EXISTING") return "已有内容";
  if (match.decision === "MANUAL") return "人工处理";
  return "未自动填写";
}

function renderMatches(): void {
  while (matchList.firstChild) matchList.removeChild(matchList.firstChild);
  for (const match of matches) {
    const row = document.createElement("li");
    row.className = "match-row";
    const copy = document.createElement("div");
    copy.className = "match-copy";
    const label = document.createElement("span");
    label.className = "match-label";
    label.textContent = match.descriptor.label || match.descriptor.name || match.descriptor.placeholder || match.descriptor.tag;
    copy.append(label);
    const meta = document.createElement("span");
    meta.className = "match-meta";
    const candidateText = match.candidate
      ? `${match.candidate.displayName}：${match.sensitiveReview ? maskSensitiveValue(match.candidate.value) : match.candidate.value}`
      : match.reason;
    meta.textContent = `${candidateText} · ${match.confidence}分`;
    copy.append(meta);
    row.append(copy);
    const state = document.createElement("span");
    state.className = `match-state ${match.decision.toLocaleLowerCase()}`;
    state.textContent = decisionLabel(match);
    row.append(state);
    if (match.decision === "SUGGEST") {
      const actions = document.createElement("div");
      actions.className = "suggest-actions";
      const confirm = document.createElement("button");
      confirm.className = "confirm-button";
      confirm.type = "button";
      confirm.textContent = "确认";
      const change = document.createElement("button");
      change.className = "confirm-button";
      change.type = "button";
      change.textContent = "改映射";
      const ignore = document.createElement("button");
      ignore.className = "ignore-button";
      ignore.type = "button";
      ignore.textContent = "忽略";
      const select = document.createElement("select");
      select.className = "profile-select hidden";
      select.setAttribute("aria-label", "选择其他 Profile 字段");
      const placeholder = document.createElement("option");
      placeholder.value = "";
      placeholder.textContent = "选择其他 Profile 字段";
      select.append(placeholder);
      const groups = new Map<string, HTMLOptGroupElement>();
      for (const candidate of buildProfileCandidates(profile).filter((item) => item.value.trim())) {
        let group = groups.get(candidate.section);
        if (!group) {
          group = document.createElement("optgroup");
          group.label = PROFILE_SECTION_LABELS[candidate.section] ?? candidate.section;
          groups.set(candidate.section, group);
          select.append(group);
        }
        const option = document.createElement("option");
        option.value = candidate.profileKey;
        option.textContent = candidate.displayName;
        group.append(option);
      }
      change.addEventListener("click", () => {
        select.classList.remove("hidden");
        change.classList.add("hidden");
        confirm.textContent = "确认映射";
      });
      confirm.addEventListener("click", () => {
        if (!select.classList.contains("hidden") && !select.value) {
          setStatus("请选择一个 Profile 字段后再确认。", true);
          return;
        }
        void confirmSuggestion(match.descriptor.id, select.value || undefined, actions);
      });
      ignore.addEventListener("click", () => {
        match.decision = "ABSTAIN";
        match.reason = "LOW_CONFIDENCE";
        state.textContent = "已忽略";
        state.className = "match-state abstain";
        actions.remove();
        setStatus("已忽略这条建议；本次不会填写，也不会保存 mapping。 ");
      });
      actions.append(confirm, change, ignore, select);
      row.append(actions);
    }
    matchList.append(row);
  }
  if (matches.length === 0) {
    const empty = document.createElement("li");
    empty.className = "match-row";
    empty.textContent = "尚未扫描页面。";
    matchList.append(empty);
  }
}

function renderSummary(data: { scanned: number; autoCandidates: number; suggestions: number; abstained: number }): void {
  while (summaryElement.firstChild) summaryElement.removeChild(summaryElement.firstChild);
  summaryElement.classList.remove("hidden");
  const values: Array<[string, number]> = [["扫描", data.scanned], ["可自动填", data.autoCandidates], ["建议", data.suggestions], ["暂不填", data.abstained]];
  for (const [label, value] of values) {
    const card = document.createElement("div");
    card.className = "summary-card";
    const strong = document.createElement("strong");
    strong.textContent = String(value);
    const caption = document.createElement("span");
    caption.textContent = label;
    card.append(strong, caption);
    summaryElement.append(card);
  }
}

function renderReport(report: FillReport): void {
  const filled = report.results.filter((result) => result.status === "FILLED").length;
  const attention = report.results.filter((result) => ["UNCERTAIN", "MANUAL_REQUIRED", "SKIPPED"].includes(result.status)).length;
  const failed = report.results.filter((result) => result.status === "FAILED").length;
  setStatus(`填写完成：成功 ${filled}，需关注 ${attention}，失败 ${failed}。请自行检查并手动提交。`);
  for (const match of matches) {
    const result = report.results.find((item) => item.fieldId === match.descriptor.id);
    if (!result) continue;
    const state = matchList.querySelector<HTMLElement>(`.match-row:nth-child(${matches.indexOf(match) + 1}) .match-state`);
    if (state) {
      state.textContent = result.status === "FILLED" ? "已填写" : result.status === "FAILED" ? "失败" : decisionLabel(match);
      state.className = `match-state ${result.status.toLocaleLowerCase()}`;
    }
  }
}

async function refreshStatus(): Promise<void> {
  const response = await send<StatusResponse>({ type: "GET_STATUS" });
  if (!response.ok || !response.profile) throw new Error(response.error ?? "无法读取本地 Profile");
  profile = response.profile;
  settings = response.settings ?? { overwriteExisting: false };
  byId<HTMLInputElement>("overwrite-existing").checked = settings.overwriteExisting;
  const count = [profile.basic.fullName, profile.basic.phone, profile.basic.email, ...profile.education.map((entry) => entry.school), ...profile.projects.map((entry) => entry.name)].filter(Boolean).length;
  byId("profile-status").textContent = count > 0 ? `本地 Profile 已就绪 · 已填写 ${count} 个资料值` : "Profile 还是空的，请先打开编辑器填写资料";
}

async function scan(): Promise<void> {
  setStatus("正在扫描当前页面…");
  const response = await send<ScanResponse>({ type: "SCAN_PAGE", profile, mappings: [] });
  if (!response.ok || !response.matches) throw new Error(response.error ?? "页面扫描失败");
  matches = response.matches;
  sessionId = response.sessionId ?? "";
  renderMatches();
  renderSummary({ scanned: response.scanned ?? 0, autoCandidates: response.autoCandidates ?? 0, suggestions: response.suggestions ?? 0, abstained: response.abstained ?? 0 });
  setStatus(`扫描完成：${response.adapterName ?? "通用表单"}。高置信度字段不会覆盖已有内容。`);
}

async function fillHighConfidence(): Promise<void> {
  if (matches.length === 0) await scan();
  setStatus("正在填写高置信度字段并回读校验…");
  const response = await send<FillResponse>({ type: "FILL_HIGH_CONFIDENCE", profile, overwriteExisting: settings.overwriteExisting });
  if (!response.ok || !response.report) throw new Error(response.error ?? "填写失败");
  renderReport(response.report);
}

async function confirmSuggestion(fieldId: string, profileKey: string | undefined, control: HTMLElement): Promise<void> {
  for (const button of Array.from(control.querySelectorAll<HTMLButtonElement>("button"))) button.disabled = true;
  const response = await send<FillResponse>({ type: "FILL_SELECTED_SUGGESTION", profile, fieldId, sessionId, profileKey, overwriteExisting: settings.overwriteExisting });
  if (!response.ok || !response.report) {
    for (const button of Array.from(control.querySelectorAll<HTMLButtonElement>("button"))) button.disabled = false;
    setStatus(response.error ?? "建议字段填写失败", true);
    return;
  }
  renderReport(response.report);
  const result = response.report.results[0];
  const match = matches.find((item) => item.descriptor.id === fieldId);
  if (result?.status === "FILLED") {
    if (match) match.decision = "EXISTING";
    control.remove();
    setStatus("已记录这次用户确认的字段映射；未来仅在页面指纹完全一致时复用。请继续检查页面。 ");
  } else {
    for (const button of Array.from(control.querySelectorAll<HTMLButtonElement>("button"))) button.disabled = false;
    setStatus(`这次建议没有成功填写：${result?.reason ?? "请重新扫描"}`, true);
  }
}

function wireEvents(): void {
  byId("edit-profile").addEventListener("click", () => void chrome.runtime.openOptionsPage());
  byId("open-options").addEventListener("click", () => void chrome.runtime.openOptionsPage());
  byId("scan-page").addEventListener("click", () => void scan().catch((error: unknown) => setStatus(error instanceof Error ? error.message : "扫描失败", true)));
  byId("fill-high").addEventListener("click", () => void fillHighConfidence().catch((error: unknown) => setStatus(error instanceof Error ? error.message : "填写失败", true)));
  byId("review-suggestions").addEventListener("click", () => {
    const first = matchList.querySelector(".confirm-button");
    if (first instanceof HTMLElement) first.scrollIntoView({ behavior: "smooth", block: "center" });
    setStatus("橙色字段需要你逐项确认；确认成功后才会记住该页面字段映射。");
  });
  byId<HTMLInputElement>("overwrite-existing").addEventListener("change", (event) => {
    settings.overwriteExisting = (event.target as HTMLInputElement).checked;
    void send({ type: "SAVE_SETTINGS", settings }).catch(() => setStatus("设置未保存", true));
  });
}

void refreshStatus().catch((error: unknown) => setStatus(error instanceof Error ? error.message : "无法读取 Profile", true));
wireEvents();
