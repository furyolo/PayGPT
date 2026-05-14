# PayGPT

PayGPT 是一个 Tampermonkey 油猴脚本，用于在 ChatGPT 页面中按 coupon 和国家生成 ChatGPT Team 支付长链接。

## 功能

- 在 `https://chatgpt.com/*` 页面显示 PayGPT 浮层面板。
- 支持输入 coupon。
- 支持选择国家，并自动设置 `billing_details.country/currency`。
- 支持选择月付或年付、填写席位数量和工作区名称。
- 支持记住上次填写的非敏感配置。
- 支持自定义取消跳转地址；留空时按 coupon 自动生成。
- 生成成功后展示长链接和 checkout session id。
- 支持一键复制生成结果。

## 支持国家

| 国家 | country | currency |
|------|---------|----------|
| 美国 | US | USD |
| 英国 | GB | GBP |
| 泰国 | TH | THB |
| 日本 | JP | JPY |
| 新加坡 | SG | SGD |
| 德国 | DE | EUR |
| 法国 | FR | EUR |
| 澳大利亚 | AU | AUD |
| 加拿大 | CA | CAD |

## 安装

1. 安装 Tampermonkey 浏览器扩展。
2. 新建用户脚本。
3. 将 [paygpt.user.js](./paygpt.user.js) 的内容粘贴到脚本编辑器中并保存。
4. 打开或刷新 `https://chatgpt.com/`。
5. 页面右下角出现 `PayGPT 长链接生成器` 面板后即可使用。

## 使用

1. 确认当前浏览器已登录 ChatGPT。
2. 输入 coupon，例如 `datroaiuk`。
3. 选择国家、账期、席位数量和工作区名称。
4. 如需指定取消跳转地址，可填写 `取消地址`；留空时脚本会按 coupon 自动生成。
5. 点击 `生成长链接`。
6. 成功后点击 `复制链接`，或手动复制结果框中的链接。

脚本会记住上次填写的 coupon、国家、账期、席位数量、工作区名称和取消地址。面板关闭后，可以从 Tampermonkey 菜单中的 `打开 PayGPT 面板` 重新打开。

## 实现边界

脚本只在用户主动点击生成时使用当前浏览器登录会话调用 ChatGPT checkout 接口。脚本不会保存 access token，也不会把 token 发送到第三方服务。

脚本仅保存表单配置，不保存登录凭证或支付结果。

项目不包含后端服务、数据库、账号系统、订单管理，也不处理绕过支付、风控或鉴权限制的能力。

## 常见错误

- `accessToken 为空`：通常表示当前浏览器未登录 ChatGPT，或 session 接口返回结构变化。
- `Checkout HTTP ...`：通常表示 coupon、国家、席位、账期或接口权限不被接受，可查看浏览器控制台中的响应摘要。
- `响应中未找到长链接`：checkout 接口响应字段可能变化，需要检查返回数据是否仍包含 `url`、`stripe_hosted_url` 或 `checkout_url`。
- `当前环境不支持自动复制`：可以手动复制结果框中的链接。

## 维护提示

ChatGPT 内部接口可能变化。若脚本失效，优先检查以下函数：

- `getAccessToken()`：登录凭证获取。
- `buildPayload()`：checkout payload 构建。
- `createCheckout()`：checkout 请求。
- `extractHostedUrl()`：长链接字段提取。
