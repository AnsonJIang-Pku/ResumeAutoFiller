import { emptyAward, emptyCustomField, emptyEducation, emptyLanguage, emptyProfile, emptyProject, emptyResearch, emptySkill, normalizeProfile } from "../shared/profile";
import { loadProfile, localStorageArea, saveProfile } from "../shared/storage";
import type { ProfileCollection, ResumeProfile } from "../shared/types";

interface FieldSpec {
  key: string;
  label: string;
  type?: "text" | "date" | "url";
  wide?: boolean;
  full?: boolean;
  placeholder?: string;
}

interface CollectionSpec {
  title: string;
  fields: FieldSpec[];
  empty: () => Record<string, string>;
}

const BASIC_FIELDS: FieldSpec[] = [
  { key: "fullName", label: "姓名" },
  { key: "englishName", label: "英文名" },
  { key: "gender", label: "性别" },
  { key: "birthDate", label: "出生日期", type: "date" },
  { key: "phone", label: "手机号" },
  { key: "email", label: "邮箱", type: "text" },
  { key: "currentCity", label: "现居城市" },
  { key: "nationality", label: "国籍" },
  { key: "politicalStatus", label: "政治面貌" },
  { key: "address", label: "地址", wide: true },
  { key: "identityNumber", label: "身份证号", wide: true, placeholder: "敏感字段，可留空" }
];

const COLLECTIONS: Record<ProfileCollection, CollectionSpec> = {
  education: {
    title: "教育经历",
    fields: [
      { key: "school", label: "学校", wide: true },
      { key: "schoolEnglish", label: "学校英文名" },
      { key: "degree", label: "学历 / 学位" },
      { key: "major", label: "专业" },
      { key: "department", label: "院系" },
      { key: "startDate", label: "入学时间", placeholder: "YYYY-MM" },
      { key: "endDate", label: "毕业时间", placeholder: "YYYY-MM" },
      { key: "gpa", label: "GPA" },
      { key: "gpaScale", label: "GPA 满分" },
      { key: "ranking", label: "排名" },
      { key: "description", label: "教育经历说明", full: true }
    ],
    empty: () => emptyEducation() as unknown as Record<string, string>
  },
  projects: {
    title: "项目经历",
    fields: [
      { key: "name", label: "项目名称", wide: true },
      { key: "role", label: "项目角色" },
      { key: "startDate", label: "开始时间", placeholder: "YYYY-MM" },
      { key: "endDate", label: "结束时间", placeholder: "YYYY-MM" },
      { key: "link", label: "项目链接", type: "url", wide: true },
      { key: "description", label: "项目描述", full: true }
    ],
    empty: () => emptyProject() as unknown as Record<string, string>
  },
  research: {
    title: "科研 / 论文",
    fields: [
      { key: "name", label: "科研 / 论文名称", wide: true },
      { key: "role", label: "角色" },
      { key: "venue", label: "发表 / 会议" },
      { key: "startDate", label: "开始时间", placeholder: "YYYY-MM" },
      { key: "endDate", label: "结束时间", placeholder: "YYYY-MM" },
      { key: "link", label: "链接", type: "url", wide: true },
      { key: "description", label: "科研描述", full: true }
    ],
    empty: () => emptyResearch() as unknown as Record<string, string>
  },
  awards: {
    title: "获奖情况",
    fields: [
      { key: "name", label: "奖项名称", wide: true },
      { key: "issuer", label: "颁发单位" },
      { key: "date", label: "获奖时间", placeholder: "YYYY-MM" },
      { key: "description", label: "获奖说明", full: true }
    ],
    empty: () => emptyAward() as unknown as Record<string, string>
  },
  languages: {
    title: "语言能力",
    fields: [
      { key: "name", label: "语言" },
      { key: "level", label: "水平" },
      { key: "score", label: "成绩" }
    ],
    empty: () => emptyLanguage() as unknown as Record<string, string>
  },
  skills: {
    title: "技能",
    fields: [
      { key: "name", label: "技能", wide: true },
      { key: "level", label: "水平" },
      { key: "description", label: "说明", full: true }
    ],
    empty: () => emptySkill() as unknown as Record<string, string>
  },
  customFields: {
    title: "自定义字段",
    fields: [
      { key: "label", label: "网页字段标签" },
      { key: "value", label: "填写值", wide: true }
    ],
    empty: () => emptyCustomField() as unknown as Record<string, string>
  }
};

const byId = <T extends HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing options element: ${id}`);
  return element as T;
};

const statusElement = byId<HTMLParagraphElement>("save-status");

function setStatus(message: string, error = false): void {
  statusElement.textContent = message;
  statusElement.style.color = error ? "#a82b31" : "#315b9a";
}

function clear(element: Element): void {
  while (element.firstChild) element.removeChild(element.firstChild);
}

function createField(spec: FieldSpec, value: string, dataAttribute: string): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.className = `field${spec.wide ? " wide" : ""}${spec.full ? " full" : ""}`;
  const label = document.createElement("label");
  label.textContent = spec.label;
  const control = spec.full ? document.createElement("textarea") : document.createElement("input");
  if (!spec.full) {
    control.setAttribute("type", spec.type ?? "text");
    if (spec.placeholder) control.setAttribute("placeholder", spec.placeholder);
  }
  control.value = value;
  control.setAttribute(dataAttribute, spec.key);
  wrapper.append(label, control);
  return wrapper;
}

function entryRecord(entry: unknown): Record<string, string> {
  if (!entry || typeof entry !== "object") return {};
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(entry)) if (typeof value === "string") result[key] = value;
  return result;
}

function updateEntryTitles(container: HTMLElement): void {
  Array.from(container.querySelectorAll<HTMLElement>(".entry-card")).forEach((card, index) => {
    const title = card.querySelector<HTMLElement>("[data-entry-title]");
    if (title) title.textContent = `第 ${index + 1} 条`;
  });
}

function renderEntry(container: HTMLElement, collection: ProfileCollection, entry: unknown, index: number): void {
  const spec = COLLECTIONS[collection];
  const record = entryRecord(entry);
  const card = document.createElement("article");
  card.className = "entry-card";
  card.dataset.entryId = record.id ?? spec.empty().id;
  const top = document.createElement("div");
  top.className = "entry-top";
  const title = document.createElement("strong");
  title.dataset.entryTitle = "true";
  title.textContent = `第 ${index + 1} 条`;
  top.append(title);
  const actions = document.createElement("div");
  actions.className = "entry-actions";
  const up = document.createElement("button");
  up.type = "button";
  up.textContent = "上移";
  up.addEventListener("click", () => {
    const previous = card.previousElementSibling;
    if (previous) previous.before(card);
    updateEntryTitles(container);
  });
  const down = document.createElement("button");
  down.type = "button";
  down.textContent = "下移";
  down.addEventListener("click", () => {
    const next = card.nextElementSibling;
    if (next) next.after(card);
    updateEntryTitles(container);
  });
  const remove = document.createElement("button");
  remove.type = "button";
  remove.textContent = "删除";
  remove.addEventListener("click", () => {
    card.remove();
    updateEntryTitles(container);
    renderEmptyState(container);
  });
  actions.append(up, down, remove);
  top.append(actions);
  card.append(top);
  const grid = document.createElement("div");
  grid.className = "entry-grid";
  for (const field of spec.fields) grid.append(createField(field, record[field.key] ?? "", "data-entry-key"));
  card.append(grid);
  container.append(card);
}

function renderEmptyState(container: HTMLElement): void {
  const existing = container.querySelector(".empty-entry");
  const hasEntries = container.querySelector(".entry-card") !== null;
  if (!hasEntries && !existing) {
    const empty = document.createElement("p");
    empty.className = "empty-entry";
    empty.textContent = "暂未添加条目。";
    container.append(empty);
  } else if (hasEntries && existing) existing.remove();
}

function renderCollection(collection: ProfileCollection, entries: unknown[]): void {
  const container = byId<HTMLElement>(`${collection}-list`);
  clear(container);
  entries.forEach((entry, index) => renderEntry(container, collection, entry, index));
  renderEmptyState(container);
}

function renderProfile(profile: ResumeProfile): void {
  const basicContainer = byId<HTMLElement>("basic-fields");
  clear(basicContainer);
  for (const field of BASIC_FIELDS) basicContainer.append(createField(field, profile.basic[field.key as keyof typeof profile.basic], "data-basic-key"));
  for (const collection of Object.keys(COLLECTIONS) as ProfileCollection[]) renderCollection(collection, profile[collection],);
}

function readBasic(): Record<string, string> {
  const result: Record<string, string> = {};
  for (const control of Array.from(document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-basic-key]"))) result[control.dataset.basicKey ?? ""] = control.value;
  return result;
}

function readCollection(collection: ProfileCollection): Record<string, string>[] {
  const container = byId<HTMLElement>(`${collection}-list`);
  return Array.from(container.querySelectorAll<HTMLElement>(".entry-card")).map((card) => {
    const result: Record<string, string> = { id: card.dataset.entryId ?? "" };
    for (const control of Array.from(card.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>("[data-entry-key]"))) result[control.dataset.entryKey ?? ""] = control.value;
    return result;
  });
}

function profileFromForm(): ResumeProfile {
  return normalizeProfile({
    version: 1,
    basic: readBasic(),
    education: readCollection("education"),
    projects: readCollection("projects"),
    research: readCollection("research"),
    awards: readCollection("awards"),
    languages: readCollection("languages"),
    skills: readCollection("skills"),
    customFields: readCollection("customFields")
  });
}

function appendEntry(collection: ProfileCollection): void {
  const container = byId<HTMLElement>(`${collection}-list`);
  container.querySelector(".empty-entry")?.remove();
  renderEntry(container, collection, COLLECTIONS[collection].empty(), container.querySelectorAll(".entry-card").length);
}

function sampleProfile(): ResumeProfile {
  const profile = emptyProfile();
  profile.basic = {
    ...profile.basic,
    fullName: "Alice Example",
    englishName: "Alice Example",
    gender: "女",
    birthDate: "2000-01-15",
    phone: "+86 13800000000",
    email: "alice@example.com",
    currentCity: "示例市",
    address: "示例区示例路 1 号",
    nationality: "中国",
    politicalStatus: "群众"
  };
  profile.education = [{ ...emptyEducation(), school: "虚构大学", schoolEnglish: "Example University", degree: "硕士", major: "计算机科学", startDate: "2021-09", endDate: "2024-06", gpa: "3.8", gpaScale: "4.0" }];
  profile.projects = [{ ...emptyProject(), name: "示例数据平台", role: "开发者", startDate: "2023-01", endDate: "2023-08", description: "用于测试的虚构项目描述。" }];
  profile.research = [{ ...emptyResearch(), name: "示例研究论文", role: "共同作者", venue: "Example Venue", startDate: "2022-01", endDate: "2023-01", description: "用于测试的虚构科研描述。" }];
  profile.skills = [{ ...emptySkill(), name: "TypeScript", level: "熟练", description: "用于测试的虚构技能。" }];
  profile.awards = [{ ...emptyAward(), name: "示例奖项", issuer: "虚构机构", date: "2023-12" }];
  profile.languages = [{ ...emptyLanguage(), name: "英语", level: "熟练", score: "示例成绩" }];
  return profile;
}

async function saveCurrent(): Promise<void> {
  await saveProfile(profileFromForm(), localStorageArea());
  setStatus("Profile 已保存到本机。扩展不会把这些资料发送到网页之外。 ");
}

function exportProfile(): void {
  const content = `${JSON.stringify(profileFromForm(), null, 2)}\n`;
  const url = URL.createObjectURL(new Blob([content], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = "resumeautofiller-profile.json";
  link.click();
  URL.revokeObjectURL(url);
  setStatus("Profile JSON 已导出到下载目录；请勿把真实资料文件提交到 Git。 ");
}

async function importProfile(file: File): Promise<void> {
  try {
    const parsed: unknown = JSON.parse(await file.text());
    const next = normalizeProfile(parsed);
    renderProfile(next);
    setStatus("已读取导入文件；点击“保存 Profile”后才会写入浏览器本地存储。 ");
  } catch {
    setStatus("导入失败：文件不是有效的 Profile JSON。", true);
  }
}

async function clearLocalData(): Promise<void> {
  if (!window.confirm("确定清空 ResumeAutoFiller 的全部本地 Profile、设置和映射吗？此操作不可撤销。")) return;
  const response = await chrome.runtime.sendMessage({ type: "CLEAR_LOCAL_DATA" });
  if (!response?.ok) throw new Error(response?.error ?? "清空失败");
  renderProfile(emptyProfile());
  setStatus("全部本地数据已清空。 ");
}

async function init(): Promise<void> {
  const profile = await loadProfile(localStorageArea());
  renderProfile(profile);
  setStatus("已加载本地 Profile；修改后点击保存。 ");
}

for (const button of Array.from(document.querySelectorAll<HTMLButtonElement>("[data-add]"))) {
  button.addEventListener("click", () => appendEntry(button.dataset.add as ProfileCollection));
}
byId("save-profile").addEventListener("click", () => void saveCurrent().catch(() => setStatus("保存失败，请重试。", true)));
byId("load-sample").addEventListener("click", () => {
  renderProfile(sampleProfile());
  setStatus("已载入虚构示例；这不会自动覆盖本地数据，确认后请点击保存。 ");
});
byId("export-profile").addEventListener("click", exportProfile);
byId("import-profile").addEventListener("click", () => byId<HTMLInputElement>("import-file").click());
byId<HTMLInputElement>("import-file").addEventListener("change", (event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (file) void importProfile(file);
});
byId("forget-mappings").addEventListener("click", () => void chrome.runtime.sendMessage({ type: "FORGET_MAPPINGS" }).then(() => setStatus("全部 mapping memory 已删除。 ")));
byId("clear-local").addEventListener("click", () => void clearLocalData().catch((error: unknown) => setStatus(error instanceof Error ? error.message : "清空失败", true)));
void init().catch(() => setStatus("无法加载本地 Profile。", true));
