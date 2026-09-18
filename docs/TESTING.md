# 测试与验收

## 命令

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm test:coverage
pnpm test:e2e
pnpm privacy:audit
pnpm build
```

`pnpm check` 会执行类型检查、lint、Vitest、隐私审计和双浏览器构建。

`test:coverage` 使用 V8 覆盖率，当前 `src/shared` statement coverage 为 91.42%。

## 测试层次

- 单元测试：Profile 稳定 ID、候选路径、normalize、mapping、matcher 分数、native setter、select、contenteditable、storage。
- Fixture 集成测试：12 个虚构页面覆盖 native、Ant-like、Element-like、重复教育/项目、ARIA、contenteditable、select、安全过滤、动态字段、Shadow DOM 和复杂控件。
- 构建内容脚本 E2E：在本机 Chrome 中加载真实构建的 `content.js`，通过消息边界扫描并填写 native fixture，验证结果回读和 overlay 后重复填写。
- unpacked UI E2E：尝试通过 Playwright 加载 `dist/chrome`，验证真实 options/popup storage flow；如果当前 Chrome 自动化策略屏蔽扩展 service worker，则测试显式 skipped，不能伪称为通过。
- 隐私审计：静态检查生产源代码和权限。

## 量化口径

对 12 个 committed fixture 组成的 golden set 使用：

```text
precision = 正确自动填写字段 / 所有自动填写字段
coverage  = 正确自动填写的确定性 eligible 字段 / 所有确定性 eligible 字段
```

当前 matcher 的安全策略优先 precision：无法区分时进入 `SUGGEST` 或 abstain，不因追求 coverage 而猜测。重复字段必须按 occurrence 与稳定 ID 对齐；existing value 默认保持 100% 不覆盖。

当前 benchmark 有 39 个显式 eligible 字段，包含重复教育/项目、ARIA、Shadow DOM、Element/Ant-like 控件、native select、contenteditable、动态页面和人工控件负例。最近一次结果：precision 100.0%、eligible coverage 100.0%、repeat identity 100.0%、negative auto-fill 0。

## 状态与原因

报告区分 `FILLED`、`SKIPPED`、`FAILED`、`MANUAL_REQUIRED`、`UNCERTAIN` 和 `NO_MATCH`。失败原因包括已有值、readonly、unsupported control、file upload、checkbox/radio、没有 Profile 值、置信度不足、页面结构变化和回读失败。

## 人工验收清单

1. 加载 `dist/chrome` 后，在 options 中载入虚构 Profile 并保存。
2. 在 `dist/fixtures` 或本地静态服务器打开 native、重复教育、select、dynamic、Shadow DOM 页面。
3. 主动打开 popup，扫描，再填写高置信度；确认已有值没有被覆盖。
4. 逐项确认一条建议字段，重新扫描同 hostname/结构，确认 mapping 可以复用；改变 label 或 occurrence 后应不复用。
5. 确认浏览器 Network 面板中没有由扩展自身发起的请求；页面自己的资源请求不计入扩展请求。
6. 最后由用户手动点击页面 Submit；扩展没有提交按钮操作路径。
