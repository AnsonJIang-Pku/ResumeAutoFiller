# ResumeAutoFiller

ResumeAutoFiller 是一个只供个人使用的 macOS Chromium 扩展，目标是减少中国招聘网申中重复填写个人资料的机械劳动。它采用“本地保存、用户主动启动、确定才填写”的策略：扫描、填写、建议确认和最终提交都由用户控制；扩展永远不会自动点击 Submit。

## 当前状态

这是一个可构建的 release candidate 版本，包含 Profile、通用扫描/匹配/填写闭环、Ant/Element/ARIA/portal custom select、建议字段人工纠正、映射管理、动态页面保护、fixture 测试和隐私审计。未声明任何真实 ATS 内部组件的稳定支持；北森和 Moka 目前只做安全识别，仍使用通用回退逻辑。

## 安装（macOS Chrome）

需要 Node.js 20+ 和 pnpm。

```bash
pnpm install
pnpm build
```

1. 打开 `chrome://extensions`。
2. 打开右上角 **Developer mode**。
3. 点击 **Load unpacked**。
4. 选择本项目的 `dist/chrome` 目录。
5. 固定 ResumeAutoFiller，方便在网申页面主动打开。

## 安装（macOS Microsoft Edge）

使用相同的构建命令，然后：

1. 打开 `edge://extensions`。
2. 打开 **Developer mode**。
3. 点击 **Load unpacked**。
4. 选择 `dist/edge` 目录。

Chrome 和 Edge 使用相同的 Manifest V3 代码，Edge 构建只增加了最低 Chromium 版本声明。

## 使用

1. 点击 **Profile**，填写基本信息、教育经历、项目、科研、获奖、语言和技能，点击保存。
2. 打开企业网申页面，在需要操作时主动点击扩展图标。
3. 点击 **扫描当前页面**。扩展只扫描当前页，不会后台扫描其他标签页。
4. 点击 **填写高置信度**。已有非空内容默认保留；如确有需要，先在 popup 中勾选覆盖选项。
5. 对橙色的建议字段逐项选择 **确认**、**改映射** 或 **忽略**。确认并实际填写成功后，才会保存该字段的 hostname + 指纹映射；映射不保存填写值，也不保存完整 URL。
6. 查看页面上的结果面板和原页面，用户自行复核所有字段，最后由用户手动提交。

文件上传、密码、验证码、复选框、单选框、复杂级联/日期控件、法律声明和提交按钮默认需要人工处理。Custom select 只有在打开后存在唯一 exact option 且回读成功时才填写；未知、0 个或多个精确选项都会交给人工。

## 支持矩阵

| 结构 | 状态 | 证据 |
| --- | --- | --- |
| Native input / textarea / select | 已验证 | fixtures 01、07、08、12 |
| Ant Design Select | 已验证 | fixture 13 + custom-select 测试 |
| Element / Element Plus Select | 已验证 | fixture 14 + custom-select 测试 |
| ARIA / body portal dropdown | 已验证 | fixture 15 + custom-select 测试 |
| Ambiguous option | 必须人工处理 | fixture 16，重复 exact option 不选择 |
| BeiSen | 已检测，通用模式 | 没有专用匿名真实 DOM fixture |
| Moka | 已检测，通用模式 | 没有专用匿名真实 DOM fixture |

已知限制：扩展会观察扫描时已经存在的 ShadowRoot，以及之后作为新增节点出现且能被观察到的 ShadowRoot；不会 monkey-patch 全局 `attachShadow()`。如果组件在观察边界之外晚于扫描创建 ShadowRoot，重新扫描即可，扩展不会偷偷重扫后继续填写。

## 开发与测试

```bash
pnpm typecheck       # TypeScript 类型检查
pnpm lint            # ESLint
pnpm test            # Vitest 单元与 fixture 集成测试
pnpm test:coverage   # V8 覆盖率报告
pnpm exec playwright install chromium  # 首次运行 E2E 时准备 Chromium
pnpm test:e2e        # 构建后运行 content + unpacked MV3 UI E2E
pnpm privacy:audit   # 检查网络 API、sync storage、遥测和 console.log
pnpm build           # 生成 dist/chrome、dist/edge 和 fixtures
pnpm check           # 依次执行类型、lint、测试、隐私审计和构建
pnpm verify          # check + 显式 PASS/SKIPPED/FAIL 的本地 release gate + E2E
```

`test-fixtures/` 只包含虚构页面和虚构资料，不包含任何真实 Profile。测试覆盖 native input/textarea/select、ARIA/邻近 label、Ant/Element/portal/ambiguous custom select、重复教育/项目/科研、Shadow DOM、contenteditable、动态字段、已有值保护、敏感/人工控件和 mapping 指纹。GitHub CI 执行非浏览器 release checks；它不替代本机 `pnpm verify`。`pnpm verify` 会把 E2E 缺少浏览器或被环境跳过明确标为 `SKIPPED`，不会默默算作通过。真实 ATS fixture 的状态见 [`real-world-fixtures/README.md`](real-world-fixtures/README.md)。

`test:e2e` 会运行真实构建的 content bundle，并用 Playwright Chromium 加载 unpacked MV3，验证 options 保存 Profile 和 popup 读取本地数据。部分系统 Chrome 发行版会在自动化模式下屏蔽扩展 service worker；测试会在缺少可用浏览器时明确 skipped，手动 `Load unpacked` 安装路径不受影响。

## 本地数据与隐私

生产数据只写入 `chrome.storage.local`。Manifest 只申请 `storage`、`activeTab` 和 `scripting`；没有 `host_permissions`、`cookies`、`history`、`webRequest` 或 `storage.sync`。

扩展源码没有 `fetch`、XHR、WebSocket、EventSource、sendBeacon、分析、Sentry 或错误上报。招聘网站自身的自动保存请求不属于扩展主动请求。Profile 的 JSON 导出由用户主动触发，导出文件必须留在本机并避免提交到 Git。

在 Profile 页面可以导入/导出、查看 mapping 的 hostname/字段描述/Profile display name/时间、删除单条映射、删除某 hostname 的映射和清除全部本地数据。清除操作只作用于 ResumeAutoFiller 的扩展本地存储。

更多设计见：

- [架构说明](docs/ARCHITECTURE.md)
- [隐私与安全边界](docs/PRIVACY.md)
- [测试与验收](docs/TESTING.md)
- [MVP 审查记录](docs/REVIEW-MVP.md)

## 明确不做的事

本项目不是求职平台，不提供岗位搜索、JD 推荐、自动投递、云同步、AI 改简历、开放题生成、账号系统、统计或社交功能。最终 Submit、签署声明和发送验证码永远保留给用户。
