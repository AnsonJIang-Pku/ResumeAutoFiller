# 测试与验收

## 命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm exec playwright install chromium  # 首次 E2E 运行前
pnpm test:e2e
pnpm privacy:audit
pnpm build
pnpm verify          # check + E2E；明确输出 PASS / SKIPPED / FAIL
```

`pnpm check` 会执行类型检查、lint、Vitest、coverage、隐私审计和双浏览器构建。

`test:coverage` 使用 V8 覆盖率，当前 `src/shared` statement coverage 为 94.94%。

## 测试层次

- 单元测试：Profile 稳定 ID、候选路径、normalize、mapping、matcher 分数、native setter、select、contenteditable、storage。
- Fixture 集成测试：18 个虚构页面覆盖 native、Ant-like、Element-like、Ant/Element custom select、body portal、ambiguous option、suggestion correction、重复教育/项目/科研、ARIA、contenteditable、select、安全过滤、动态字段、Shadow DOM 和复杂控件。
- 构建内容脚本 E2E：在本机 Chrome 中加载真实构建的 `content.js`，通过消息边界扫描并填写 native fixture，验证结果回读和 overlay 后重复填写。
- unpacked UI E2E：通过 Playwright Chromium 加载 `dist/chrome`，验证真实 options/popup storage flow，以及 options → fixture tab → popup scan/fill flow；后者使用只存在于临时测试副本中的 loopback host permission，以弥补 headless Playwright 无法产生浏览器 toolbar activeTab gesture 的限制，生产 manifest 仍保持无 host permission。
- 隐私审计：静态检查生产源代码和权限。

## 量化口径

对 18 个 committed fixture 组成的 golden set 使用：

```text
precision = 正确自动填写字段 / 所有自动填写字段
coverage  = 正确自动填写的确定性 eligible 字段 / 所有确定性 eligible 字段
```

当前 matcher 的安全策略优先 precision：无法区分时进入 `SUGGEST` 或 abstain，不因追求 coverage 而猜测。重复字段必须按 occurrence 与稳定 ID 对齐；existing value 默认保持 100% 不覆盖。

benchmark 同时报告 `total_scanned`、计划中的 `auto/suggest/manual/abstain`、实际 `auto_filled`、`unsupported`、precision、overall/native/custom-select coverage、repeat identity 和 serious wrong autofill。最近一次本地结果（以 `pnpm test` 输出为准）为 18 fixtures、54 scanned、44 eligible、45 AUTO plans、44 actual auto-filled、1 SUGGEST、5 MANUAL、0 ABSTAIN、precision 100.0%、coverage 100.0%、native 100.0%、custom-select 100.0%、repeat identity 100.0%、serious wrong autofill 0。

## 状态与原因

报告区分 `FILLED`、`SKIPPED`、`FAILED`、`MANUAL_REQUIRED`、`UNCERTAIN` 和 `NO_MATCH`。失败原因包括已有值、readonly、unsupported control、file upload、checkbox/radio、没有 Profile 值、置信度不足、页面结构变化和回读失败。

## 人工验收清单

1. 加载 `dist/chrome` 后，在 options 中载入虚构 Profile 并保存。
2. 在 `dist/fixtures` 或本地静态服务器打开 native、重复教育、select、dynamic、Shadow DOM 页面。
3. 主动打开 popup，扫描，再填写高置信度；确认已有值没有被覆盖。
4. 逐项确认一条建议字段，或改选另一个本地 Profile 字段；只有填写成功并复核后 mapping 才会出现。重新扫描同 hostname/结构确认复用；改变 label、occurrence、hostname 或删除 Profile stable ID 后应不复用。
5. 在 options、popup 和 content fill E2E 中确认扩展自身没有 `http(s)`/`ws` 请求；招聘页面自己的请求不计入扩展请求。
6. 通过 options mapping 管理删除单条、某 hostname 和全部 mapping。
7. 最后由用户手动点击页面 Submit；扩展没有提交按钮操作路径。
