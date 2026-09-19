# Real-world fixture status

`REAL_ATS_FIXTURE_NOT_AVAILABLE`

本仓库目前没有提交北森或 Moka 的真实脱敏 DOM fixture。当前公开可验证的材料不足以在不登录、不提交申请、不接触用户个人信息的前提下形成可审计的页面快照，因此不会把 synthetic fixture 冒充真实 ATS 数据。

当前策略：

- BeiSen：可检测平台，使用通用安全模式；没有专用内部 DOM 支持声明。
- Moka：可检测平台，使用通用安全模式；没有专用内部 DOM 支持声明。
- `test-fixtures/`：全部是虚构页面，只用于 deterministic matcher、executor、custom-select 和安全边界测试。

若未来加入真实 fixture，必须只保留完成测试所需的匿名结构，并删除 cookie、token、CSRF、tracking id、user id、姓名、邮箱、手机号、查询参数、隐藏密钥和分析脚本。
