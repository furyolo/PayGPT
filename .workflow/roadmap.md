# PayGPT Roadmap

## 输入需求摘要

PayGPT 要做成一个 Tampermonkey 油猴脚本，用于在 ChatGPT 页面中生成支付长链接。首个可用版本需要支持用户选择 coupon 和国家，然后按选择组合 `billing_details.country` 与 `billing_details.currency`，请求 checkout 接口并展示可复制的长链接。

当前已知国家映射：

| 国家 | country | currency |
|------|---------|----------|
| 美国 | US | USD |
| 英国 | GB | GBP |
| 泰国 | TH | THB |

说明：需求文本中英国写作 `currency: "GB"`，参考代码中为 `GBP`，路线图按合法货币代码 `GBP` 处理。

## 产品边界

首版只做本地浏览器脚本，不做后端服务、数据库、账号系统或订单管理。脚本只在用户已登录 ChatGPT 且主动点击生成时使用当前浏览器会话调用接口，不保存、不外传 access token，不做风控绕过、价格规避或未授权支付能力。

## MVP 交互草图

```text
+--------------------------------------------------+
| PayGPT 长链接生成器                              |
+--------------------------------------------------+
| Coupon      [ datroaiuk                 ]        |
| 国家        [ 英国 GB / GBP            v]        |
| 账期        [ month                    v]        |
| 席位        [ 2                         ]        |
| 工作区名    [ workspace                 ]        |
|                                                  |
| [生成长链接]  [复制链接]                         |
|                                                  |
| 状态：等待生成                                    |
| 链接：https://checkout.stripe.com/...             |
+--------------------------------------------------+
```

## Phase 1：需求固化与脚本边界

**目标**：把可配置项、接口 payload 和安全边界定清楚，避免实现时隐式扩展需求。

**任务**：

- 定义 `COUNTRY_OPTIONS` 配置表，包含显示名、`country`、`currency`。
- 定义 coupon 输入策略：默认值可为空或使用用户输入，不把 coupon 写死到不可改常量。
- 定义 Team plan payload 的首版字段：`plan_name`、`team_plan_data.workspace_name`、`price_interval`、`seat_quantity`、`billing_details`、`cancel_url`、`promo_code`、`checkout_ui_mode`。
- 明确错误分支：未登录、session 接口失败、accessToken 缺失、checkout 请求失败、响应里无长链接。
- 明确日志策略：记录步骤、HTTP 状态和响应摘要；不打印完整 access token。

**成功标准**：

- 国家/货币映射写入源码常量并可被 UI 使用。
- payload 字段来源清晰，不存在散落硬编码。
- 文档中明确哪些能力不做。

## Phase 2：Tampermonkey 脚本骨架与 UI

**目标**：完成可安装、可打开、可输入参数的油猴脚本框架。

**任务**：

- 创建 `paygpt.user.js`，包含 Tampermonkey 元数据：`@match https://chatgpt.com/*`、必要 `@grant`、必要 `@connect`。
- 用原生 DOM 创建固定浮层面板，不引入 UI 依赖。
- 实现 coupon 输入、国家下拉、账期选择、席位数输入、工作区名输入。
- 实现状态区和结果链接区，所有状态变化通过统一 `setStatus` 更新。
- 实现复制能力，优先使用 `GM_setClipboard`，无权限时再考虑 `navigator.clipboard.writeText`。

**成功标准**：

- 在 ChatGPT 页面能看到 PayGPT 面板。
- 用户可以选择美国、英国、泰国并输入 coupon。
- 点击按钮前不会自动请求支付接口。
- UI 不遮挡主要页面操作，可折叠或关闭。

## Phase 3：支付长链接生成链路

**目标**：接入参考代码里的 session token 与 checkout 请求流程，按用户选择生成长链接。

**任务**：

- 实现 `getAccessToken()`：调用 `/api/auth/session`，只返回 `accessToken`，失败时抛出可读错误。
- 实现 `buildPayload(formState)`：根据国家选择写入 `billing_details.country/currency`，根据 coupon 同步 `promo_code` 与 `cancel_url`。
- 实现 `createCheckout(payload, accessToken)`：POST `https://chatgpt.com/backend-api/payments/checkout`。
- 实现响应解析：按 `data.url || data.stripe_hosted_url || data.checkout_url` 提取长链接，同时记录 `checkout_session_id`。
- 实现按钮流程：读取表单 → 校验 → 获取 token → 创建 checkout → 展示链接 → 允许复制。

**成功标准**：

- 美国生成 payload 为 `country: "US"`、`currency: "USD"`。
- 英国生成 payload 为 `country: "GB"`、`currency: "GBP"`。
- 泰国生成 payload 为 `country: "TH"`、`currency: "THB"`。
- 请求失败时 UI 显示 HTTP 状态和错误摘要，不出现空 catch。
- 成功时展示可复制的长链接和 checkout session id。

## Phase 4：验证、交付与维护

**目标**：验证核心路径，整理安装说明，降低后续接口变化带来的维护成本。

**任务**：

- 做手工验证清单：三国 payload、coupon 为空/非空、token 缺失、接口失败、响应字段不同名。
- 在脚本顶部维护版本号和变更说明。
- 编写 `README.md`：安装方式、使用步骤、支持国家、常见错误、合规边界。
- 若引入单元测试环境，优先测试纯函数：国家映射、payload 构建、响应链接提取。
- 记录接口变化风险：ChatGPT 内部接口不稳定，失败时优先检查响应结构和权限。

**成功标准**：

- 用户能按 README 安装脚本并生成链接。
- 至少完成一次真实页面手工验证或记录无法验证的原因。
- 关键纯函数有可重复验证方式，后续改国家/coupon 不需要改请求流程。

## 风险与处理

| 风险 | 影响 | 处理方式 |
|------|------|----------|
| ChatGPT 内部接口变化 | 脚本突然失效 | 将 token 获取、payload 构建、响应解析拆成独立函数，便于快速定位 |
| coupon 与国家组合无效 | checkout 请求失败 | UI 显示接口返回摘要，让用户能调整 coupon 或国家 |
| accessToken 获取失败 | 无法生成链接 | 明确提示用户确认已登录 ChatGPT |
| Clipboard 权限差异 | 无法复制链接 | 优先 `GM_setClipboard`，失败时展示文本让用户手动复制 |
| 合规边界不清 | 误用脚本 | README 和 UI 文案标明仅用于用户本人已登录会话生成链接 |

## 推荐下一步

执行实现阶段前，先确认两个细节：

- coupon 是否需要提供默认值，例如 `datroaiuk`，还是每次让用户输入。
- `price_interval` 和 `seat_quantity` 是否固定为 `month`、`2`，还是首版也允许用户选择。
