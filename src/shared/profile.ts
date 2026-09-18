import { createStableId } from "./ids";
import type {
  AwardEntry,
  BasicProfile,
  CandidateDefinition,
  CustomField,
  EducationEntry,
  LanguageEntry,
  ProfileCandidate,
  ProfileCollection,
  ProfileKey,
  ProjectEntry,
  ResearchEntry,
  ResumeProfile,
  SkillEntry
} from "./types";

export const EMPTY_BASIC: BasicProfile = {
  fullName: "",
  englishName: "",
  gender: "",
  birthDate: "",
  phone: "",
  email: "",
  currentCity: "",
  address: "",
  nationality: "",
  politicalStatus: "",
  identityNumber: ""
};

export function emptyEducation(): EducationEntry {
  return {
    id: createStableId("education"),
    school: "",
    schoolEnglish: "",
    degree: "",
    major: "",
    department: "",
    startDate: "",
    endDate: "",
    gpa: "",
    gpaScale: "",
    ranking: "",
    description: ""
  };
}

export function emptyProject(): ProjectEntry {
  return { id: createStableId("project"), name: "", role: "", startDate: "", endDate: "", link: "", description: "" };
}

export function emptyResearch(): ResearchEntry {
  return { id: createStableId("research"), name: "", role: "", venue: "", startDate: "", endDate: "", link: "", description: "" };
}

export function emptyAward(): AwardEntry {
  return { id: createStableId("award"), name: "", issuer: "", date: "", description: "" };
}

export function emptyLanguage(): LanguageEntry {
  return { id: createStableId("language"), name: "", level: "", score: "" };
}

export function emptySkill(): SkillEntry {
  return { id: createStableId("skill"), name: "", level: "", description: "" };
}

export function emptyCustomField(): CustomField {
  return { id: createStableId("custom"), label: "", value: "" };
}

export function emptyProfile(): ResumeProfile {
  return {
    version: 1,
    basic: { ...EMPTY_BASIC },
    education: [],
    projects: [],
    research: [],
    awards: [],
    languages: [],
    skills: [],
    customFields: []
  };
}

function nonEmptyString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function preserveId(value: unknown, prefix: string): string {
  const candidate = nonEmptyString(value).trim();
  return candidate || createStableId(prefix);
}

function normalizeArray<T>(value: unknown, prefix: string, factory: () => T): T[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  return value.map((entry) => {
    const source = entry && typeof entry === "object" ? entry : {};
    const sourceRecord = source as Record<string, unknown>;
    let id = preserveId(sourceRecord.id, prefix);
    while (usedIds.has(id)) id = createStableId(prefix);
    usedIds.add(id);
    return { ...factory(), ...sourceRecord, id } as T;
  });
}

export function normalizeProfile(input: unknown): ResumeProfile {
  const fallback = emptyProfile();
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const basicSource = source.basic && typeof source.basic === "object" ? source.basic as Record<string, unknown> : {};
  const basic = Object.fromEntries(Object.keys(EMPTY_BASIC).map((key) => [key, nonEmptyString(basicSource[key])])) as unknown as BasicProfile;
  return {
    version: 1,
    basic: { ...fallback.basic, ...basic },
    education: normalizeArray(source.education, "education", emptyEducation),
    projects: normalizeArray(source.projects, "project", emptyProject),
    research: normalizeArray(source.research, "research", emptyResearch),
    awards: normalizeArray(source.awards, "award", emptyAward),
    languages: normalizeArray(source.languages, "language", emptyLanguage),
    skills: normalizeArray(source.skills, "skill", emptySkill),
    customFields: normalizeArray(source.customFields, "custom", emptyCustomField)
  };
}

export const CANDIDATE_DEFINITIONS: CandidateDefinition[] = [
  { canonicalKey: "basic.fullName", displayName: "姓名", section: "basic", path: "basic.fullName", aliases: ["姓名", "真实姓名", "中文名", "name", "full name", "candidate name"] },
  { canonicalKey: "basic.englishName", displayName: "英文名", section: "basic", path: "basic.englishName", aliases: ["英文名", "英文姓名", "english name", "preferred name"] },
  { canonicalKey: "basic.gender", displayName: "性别", section: "basic", path: "basic.gender", aliases: ["性别", "gender", "sex"], expectedTypes: ["radio", "select", "text"] },
  { canonicalKey: "basic.birthDate", displayName: "出生日期", section: "basic", path: "basic.birthDate", aliases: ["出生日期", "出生年月", "生日", "birth date", "date of birth"], expectedTypes: ["date", "month", "text"] },
  { canonicalKey: "basic.phone", displayName: "手机号", section: "basic", path: "basic.phone", aliases: ["手机号", "手机号码", "联系电话", "联系电话号码", "移动电话", "phone", "mobile", "telephone"], expectedTypes: ["tel", "text", "number"] },
  { canonicalKey: "basic.email", displayName: "邮箱", section: "basic", path: "basic.email", aliases: ["邮箱", "电子邮箱", "电子邮件", "email", "e-mail"], expectedTypes: ["email", "text"] },
  { canonicalKey: "basic.currentCity", displayName: "现居城市", section: "basic", path: "basic.currentCity", aliases: ["现居城市", "当前城市", "所在城市", "居住城市", "current city", "city"] },
  { canonicalKey: "basic.address", displayName: "地址", section: "basic", path: "basic.address", aliases: ["通讯地址", "联系地址", "家庭住址", "地址", "address"] },
  { canonicalKey: "basic.nationality", displayName: "国籍", section: "basic", path: "basic.nationality", aliases: ["国籍", "nationality", "citizenship"] },
  { canonicalKey: "basic.politicalStatus", displayName: "政治面貌", section: "basic", path: "basic.politicalStatus", aliases: ["政治面貌", "政治身份", "political status"] },
  { canonicalKey: "basic.identityNumber", displayName: "身份证号", section: "basic", path: "basic.identityNumber", sensitive: true, aliases: ["身份证号", "身份证号码", "证件号码", "identity number", "national id"], expectedTypes: ["text", "number"] },
  { canonicalKey: "education.school", displayName: "学校", section: "education", path: "education", aliases: ["学校", "院校", "毕业院校", "学校名称", "就读院校", "university", "school", "college"] },
  { canonicalKey: "education.schoolEnglish", displayName: "学校英文名", section: "education", path: "education", aliases: ["学校英文名", "英文学校", "university english name"] },
  { canonicalKey: "education.degree", displayName: "学历/学位", section: "education", path: "education", aliases: ["学历", "学位", "学历学位", "degree", "education level"] },
  { canonicalKey: "education.major", displayName: "专业", section: "education", path: "education", aliases: ["专业", "所学专业", "主修专业", "major", "field of study"] },
  { canonicalKey: "education.department", displayName: "院系", section: "education", path: "education", aliases: ["院系", "学院", "系别", "department", "faculty"] },
  { canonicalKey: "education.startDate", displayName: "入学时间", section: "education", path: "education", aliases: ["入学时间", "开始时间", "就读开始", "start date", "from"], expectedTypes: ["date", "month", "text"] },
  { canonicalKey: "education.endDate", displayName: "毕业时间", section: "education", path: "education", aliases: ["毕业时间", "结束时间", "就读结束", "end date", "to", "graduation date"], expectedTypes: ["date", "month", "text"] },
  { canonicalKey: "education.gpa", displayName: "GPA", section: "education", path: "education", aliases: ["gpa", "平均绩点", "绩点", "grade point average"], expectedTypes: ["number", "text"] },
  { canonicalKey: "education.gpaScale", displayName: "GPA满分", section: "education", path: "education", aliases: ["gpa满分", "绩点满分", "gpa scale"] },
  { canonicalKey: "education.ranking", displayName: "排名", section: "education", path: "education", aliases: ["专业排名", "年级排名", "排名", "ranking", "rank"] },
  { canonicalKey: "education.description", displayName: "教育经历说明", section: "education", path: "education", aliases: ["教育经历说明", "教育描述", "education description"] },
  { canonicalKey: "projects.name", displayName: "项目名称", section: "projects", path: "projects", aliases: ["项目名称", "项目名", "项目", "project name", "project"] },
  { canonicalKey: "projects.role", displayName: "项目角色", section: "projects", path: "projects", aliases: ["项目角色", "担任角色", "职责", "role", "project role"] },
  { canonicalKey: "projects.startDate", displayName: "项目开始时间", section: "projects", path: "projects", aliases: ["项目开始时间", "开始时间", "start date", "from"], expectedTypes: ["date", "month", "text"] },
  { canonicalKey: "projects.endDate", displayName: "项目结束时间", section: "projects", path: "projects", aliases: ["项目结束时间", "结束时间", "end date", "to"], expectedTypes: ["date", "month", "text"] },
  { canonicalKey: "projects.link", displayName: "项目链接", section: "projects", path: "projects", aliases: ["项目链接", "项目地址", "项目网址", "project link", "url", "repository"] },
  { canonicalKey: "projects.description", displayName: "项目描述", section: "projects", path: "projects", aliases: ["项目描述", "项目介绍", "项目内容", "description", "project description"] },
  { canonicalKey: "research.name", displayName: "科研名称", section: "research", path: "research", aliases: ["科研名称", "论文名称", "研究名称", "论文题目", "research name", "paper title"] },
  { canonicalKey: "research.role", displayName: "科研角色", section: "research", path: "research", aliases: ["科研角色", "作者角色", "研究角色", "research role", "author role"] },
  { canonicalKey: "research.venue", displayName: "发表/会议", section: "research", path: "research", aliases: ["发表期刊", "会议", "发表平台", "venue", "journal", "conference"] },
  { canonicalKey: "research.startDate", displayName: "科研开始时间", section: "research", path: "research", aliases: ["科研开始时间", "研究开始", "start date"], expectedTypes: ["date", "month", "text"] },
  { canonicalKey: "research.endDate", displayName: "科研结束时间", section: "research", path: "research", aliases: ["科研结束时间", "研究结束", "end date"], expectedTypes: ["date", "month", "text"] },
  { canonicalKey: "research.link", displayName: "科研链接", section: "research", path: "research", aliases: ["论文链接", "科研链接", "publication link", "paper link", "url"] },
  { canonicalKey: "research.description", displayName: "科研描述", section: "research", path: "research", aliases: ["科研描述", "研究描述", "摘要", "research description", "abstract"] },
  { canonicalKey: "awards.name", displayName: "奖项名称", section: "awards", path: "awards", aliases: ["奖项名称", "获奖名称", "奖项", "award", "award name"] },
  { canonicalKey: "awards.issuer", displayName: "颁发单位", section: "awards", path: "awards", aliases: ["颁发单位", "授予单位", "issuer", "awarding organization"] },
  { canonicalKey: "awards.date", displayName: "获奖时间", section: "awards", path: "awards", aliases: ["获奖时间", "颁奖时间", "award date"], expectedTypes: ["date", "month", "text"] },
  { canonicalKey: "awards.description", displayName: "获奖说明", section: "awards", path: "awards", aliases: ["获奖说明", "奖项描述", "award description"] },
  { canonicalKey: "languages.name", displayName: "语言", section: "languages", path: "languages", aliases: ["语言", "语种", "language"] },
  { canonicalKey: "languages.level", displayName: "语言水平", section: "languages", path: "languages", aliases: ["语言水平", "熟练程度", "language level", "proficiency"] },
  { canonicalKey: "languages.score", displayName: "语言成绩", section: "languages", path: "languages", aliases: ["语言成绩", "考试成绩", "language score", "score"] },
  { canonicalKey: "skills.name", displayName: "技能", section: "skills", path: "skills", aliases: ["技能", "专业技能", "技术栈", "skills", "skill"] },
  { canonicalKey: "skills.level", displayName: "技能水平", section: "skills", path: "skills", aliases: ["技能水平", "熟练度", "skill level", "proficiency"] },
  { canonicalKey: "skills.description", displayName: "技能说明", section: "skills", path: "skills", aliases: ["技能说明", "技能描述", "skill description"] }
];

function getValue(source: unknown, path: string): string {
  const parts = path.split(".");
  let current: unknown = source;
  for (const part of parts) {
    if (!current || typeof current !== "object") return "";
    current = (current as Record<string, unknown>)[part];
  }
  return typeof current === "string" ? current : "";
}

function candidatesForCollection(profile: ResumeProfile, definition: CandidateDefinition): ProfileCandidate[] {
  const collection = profile[definition.path as keyof ResumeProfile];
  if (!Array.isArray(collection)) return [];
  return collection.map((entry, occurrence) => ({
    profileKey: `${definition.path}.${entry.id}.${definition.canonicalKey.split(".")[1]}`,
    canonicalKey: definition.canonicalKey,
    displayName: `${definition.displayName} ${occurrence + 1}`,
    value: getValue(entry, definition.canonicalKey.split(".")[1] ?? ""),
    section: definition.section,
    occurrence,
    sensitive: Boolean(definition.sensitive),
    aliases: definition.aliases,
    expectedTypes: definition.expectedTypes ?? []
  }));
}

export function buildProfileCandidates(profileInput: ResumeProfile): ProfileCandidate[] {
  const profile = normalizeProfile(profileInput);
  const candidates: ProfileCandidate[] = [];
  for (const definition of CANDIDATE_DEFINITIONS) {
    if (definition.path === "basic.fullName" || definition.path.startsWith("basic.")) {
      candidates.push({
        profileKey: definition.path,
        canonicalKey: definition.canonicalKey,
        displayName: definition.displayName,
        value: getValue(profile, definition.path),
        section: definition.section,
        occurrence: 0,
        sensitive: Boolean(definition.sensitive),
        aliases: definition.aliases,
        expectedTypes: definition.expectedTypes ?? []
      });
    } else {
      candidates.push(...candidatesForCollection(profile, definition));
    }
  }
  for (const custom of profile.customFields) {
    if (custom.label.trim() && custom.value.trim()) {
      candidates.push({
        profileKey: `customFields.${custom.id}.value`,
        canonicalKey: "custom.value",
        displayName: custom.label.trim(),
        value: custom.value,
        section: "custom",
        occurrence: 0,
        sensitive: false,
        aliases: [custom.label],
        expectedTypes: []
      });
    }
  }
  return candidates;
}

export function resolveProfileValue(profileInput: ResumeProfile, profileKey: ProfileKey): string {
  const profile = normalizeProfile(profileInput);
  const [root, id, property] = profileKey.split(".");
  if (root === "basic") return getValue(profile, profileKey);
  if (root === "customFields") {
    const entry = profile.customFields.find((item) => item.id === id);
    return entry && property === "value" ? entry.value : "";
  }
  if (!root || !id || !property) return "";
  const collection = profile[root as ProfileCollection];
  if (!Array.isArray(collection)) return "";
  const entry = collection.find((item) => item.id === id);
  const value = entry ? (entry as unknown as Record<string, unknown>)[property] : undefined;
  return typeof value === "string" ? value : "";
}
