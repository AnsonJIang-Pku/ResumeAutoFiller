# 架构说明

## 模块边界

```text
Profile options page
        │ chrome.storage.local
        ▼
Background service worker ── activeTab + scripting ──► content script
        │                                                  │
        │                                                  ├─ scanDocument
        │                                                  ├─ matchFields
        │                                                  └─ executeMatches
        ▼                                                  ▼
 local mappings                                      page overlay report
```

- `src/shared/profile.ts`：Profile schema、稳定 ID、候选字段目录和路径解析。
- `src/shared/scanner.ts`：可见控件扫描、Shadow DOM、label/ARIA/邻近文本提取、section 和 occurrence。
- `src/shared/matcher.ts`：无 AI 的 alias + section + type + occurrence 解释型打分。
- `src/shared/executor.ts`：原生 value setter、事件、select/contenteditable 填写和复核。
- `src/shared/engine.ts`：扫描结果与 Profile 的执行计划、状态和报告。
- `src/shared/mapping.ts`：hostname + field fingerprint 的本地映射记忆。
- `src/shared/storage.ts`：唯一的本地存储边界。
- `src/shared/adapters.ts`：adapter 接口和通用/安全识别适配器；未验证的 ATS 不改变通用逻辑。
- `src/background/main.ts`：只处理用户从 popup/options 发起的消息和当前 tab。
- `src/content/main.ts`：只在被注入并收到 Scan 消息后扫描；页面结构改变后要求重新扫描。

## 用户主动边界

Manifest 没有永久 host permission，也没有静态 content script。点击扩展 popup 后，service worker 通过 `activeTab` 和 `scripting` 将 content script 注入当前 tab。注入本身不扫描；只有收到 `SCAN_PAGE` 消息时才建立字段快照。MutationObserver 只在用户启动后用于标记快照过期，不会自动重扫或自动填写。

## Profile 与重复身份

教育、项目、科研、获奖、语言、技能和自定义字段都保留独立稳定 ID，例如 `education.education-uuid.school`。页面字段只使用本次扫描的 occurrence 与 Profile 数组顺序对齐，数组重排不会把永久身份改成 `education[0]`。mapping 记录同样只指向稳定 Profile key，不写入实际资料值。

## 匹配策略

候选分数来自：

- label 与 alias 完全相等：强分；label 包含 alias：中分。
- name、placeholder、input type 和 section：辅助分。
- repeat section 的 occurrence 对齐：加分；错位：扣分。
- section 冲突、候选差距过小：降低置信度并 abstain。

默认阈值：`AUTO_THRESHOLD = 80`，`SUGGEST_THRESHOLD = 55`。低于建议阈值的字段不填写；处于建议区间的字段只有在 popup 中逐项确认后才能执行。精确 fingerprint mapping 可以把已确认的字段提升为 auto，但 hostname 和 fingerprint 必须完全一致。

## 执行与验证

input/textarea 使用原型上的 native setter，随后派发 `input`、`change`、`blur`；select 只接受唯一的 exact option；contenteditable 写入 textContent 并派发事件。每次执行后重新读取实际值。已有值默认返回 `SKIPPED/EXISTING_VALUE`，readonly、file、password、checkbox、radio、复杂 combobox 和最终提交始终不自动执行。

## 构建

`scripts/build.mjs` 使用 esbuild 生成 Chrome 和 Edge 两个目录，拷贝独立 popup/options HTML/CSS 和 fixture。构建产物在 `dist/`，已被 `.gitignore` 排除；发布时只需要加载对应的 unpacked 目录。
