# 隐私与安全边界

## 结论

ResumeAutoFiller 是 local-only / privacy-first / zero-backend 扩展。它没有登录、账号、云同步、LLM、第三方 API、分析、遥测、广告、远程配置或后台职位搜索。

## 权限

Manifest 只声明：

- `storage`：保存 Profile、设置和不含值的 mapping 记录。
- `activeTab`：用户点击扩展后获得当前页面的临时访问能力。
- `scripting`：把 content script 注入用户当前主动操作的页面。

没有 `host_permissions`、`cookies`、`history`、`webRequest`、`clipboardRead`、`downloads` 或 `storage.sync`。下载 Profile JSON 是 options 页面中用户主动点击触发的浏览器 Blob 下载，不是网络上传。

## 数据流

Profile 只在 options 页面、service worker 和当前 tab 的 content script 之间通过浏览器扩展消息流动。字段匹配和填写在本地完成。mapping 只记录：

```text
hostname
field fingerprint
stable profileKey
createdAt / updatedAt
```

mapping 不记录 field value、完整 URL、query string 或页面正文。源码不会把 Profile 写入 URL、Git、日志或网络请求。
fingerprint 是本地同步 128-bit hash，用于页面结构相等性判断，不是身份凭据，也不会上传。

## 页面安全

页面文本进入 popup/overlay/options 时使用 `textContent`，不是 `innerHTML`。页面中的插件 overlay 使用隔离 ShadowRoot，并带有明确的 `data-resume-autofiller-root` 标记，扫描器会忽略它。文件上传、密码、验证码、声明和 Submit 不绕过浏览器安全模型。

## 审计命令

```bash
pnpm privacy:audit
```

该审计会检查生产 `src/` 和构建产物是否出现 fetch、XHR、WebSocket、EventSource、sendBeacon、sync storage、analytics/telemetry/Sentry 或 `console.log`，并核对 Manifest 权限白名单、`host_permissions`、`optional_host_permissions`、`externally_connectable`、CSP 远程 origin 和 web-accessible resource 的远程匹配规则。测试页面可以包含动态 DOM 代码；它们不属于扩展生产代码。

## 用户责任

用户仍应检查招聘网站是否有自己的自动保存或正常表单请求。扩展不会尝试阻止网页自身的网络行为，也不会替用户点击最终提交。真实 Profile 导出文件和浏览器本地存储需要用户自行保护；仓库 `.gitignore` 会忽略 `tmp/`、local-data 和 Profile 文件名模式，但不替代用户的密钥管理。
