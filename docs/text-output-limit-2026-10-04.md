# 1597字剧本触发输出限制与生成提示修复

## 一、确认事实

用户截图中的两个提示分别来自分镜生成和后台资产提取。本轮只读分析本地数据库临时副本，确认“稳赚不赔的生子丸”已保存剧本1597字、已有8条分镜，选择 `arcreel-screenplay-to-storyboard`；默认文本配置为官方 `api.deepseek.com` 的 `deepseek-flash`，`thinking=auto`。没有输出密钥、修改原数据库或覆盖项目。

请求路径分别是 `app/api/ai/route.ts → textRequest` 和 `app/api/assets/route.ts → textRequest`。旧逻辑给分镜每段固定12000 tokens，资产固定8000 tokens，并非采用模型最大能力；剧本还按约1400字分段。输入字数、实际请求（另含 Skill/系统规则/相关资产）和生成输出预算是不同的量，不能用1597字正文直接推断生成结果不会被截断。

[DeepSeek官方接口说明](https://api-docs.deepseek.com/api/create-chat-completion/)（2026-10-04查阅）说明 `deepseek-flash` 默认启用思考，思考模式默认输出预算64K，非思考模式默认8K；[思考模式说明](https://api-docs.deepseek.com/guides/thinking_mode/)区分 `reasoning_content` 与最终 `content`。系统显式设置8K/12K会限制生成空间，而分镜JSON会展开原剧本。因此确定存在小输出预算与默认思考模式不匹配的问题。

历史模型原始响应没有保留：上方截图能确认服务返回 `finish_reason=length`；下方仅能确认无最终正文，不能追溯当次具体推理 token 数或断定两次请求的全部细节。此次没有主动提交该项目做真实模型重跑，不将模拟通过说成已替用户生成成功。

## 二、修复内容

- `lib/model-server.ts` 对已知的 DeepSeek Flash/V4 Pro/V4 Flash 思考模式，把较小的显式输出预算至少提高到65536 tokens；若请求明确 `reasoning_effort=max` 则至少131072。保留更高的调用方预算。用户明确关闭思考和未知模型仍使用原预算，不给其他厂商强加参数；未显式传预算时仍由厂商决定。
- 底层明确区分空正文与空正文且长度截断。分镜调用可以取得空正文的 `length` 响应做任务级处理；不会把推理内容当作剧本、资产或分镜JSON。只有推理没有正文时不递归拆分，避免不断消耗相同推理预算。已有正文但被截断的分镜仍保留有界分段回退，全部有效后才可应用。
- 资产与分镜错误说明明确为输出截断，避免一律建议缩短剧本输入。服务端只记录结束原因、请求预算、正文字数、推理是否存在及可用的 token 用量，不记录原文、推理正文或凭据。桌面旧日志转发只保留泛化诊断提示，这些结构化服务端诊断不等于已在桌面历史日志完整留存。
- 顶部提示按当前任务显示“AI正在生成故事方案／故事／剧本／分镜／分镜提示词”等。分镜显示段落进度或格式转换状态；视频和图片独立生成入口在提交时也明确任务类型。视频任务仍由任务中心跟踪，不虚构统一文字生成弹窗正在运行视频。

## 三、验证与交付

回归先复现了旧8000预算、推理截断丢失结束状态和误导错误说明，修复后通过。新增 `tests/text-output.mjs` 验证思考预算、显式关闭兼容、未知模型兼容、空截断传递、真正空响应拒绝；`tests/generation-status.mjs` 渲染真实工作台提示分支，确认任务名和段落进度；`tests/storyboard-flow.mjs` 新增仅推理截断只请求一次的断言。

通过：core、creative、generation-status、models、text-output、asset-consistency、assets、repair-flow、asset-review-ui、episodes、storyboard-normalize、storyboard-flow；类型检查、定向lint、diff检查和Web构建。模型接口使用替身，无付费模型测试。生成独立Mac本地目录 `desktop/release/v0.1.106/mac/`，包含此前0.1.105资产一致性修复；旧版本保留，未制作Windows包、提交推送或发布更新渠道。

独立临时目录的Electron启动验证通过：登录页正常、未授权项目API返回401、渲染器Node访问关闭。随后通过正常退出流程关闭0.1.105，原有未保存保护日志记录用户确认退出；未强杀进程。已打开正式0.1.106窗口，日志确认版本及 `Local workspace ready`。未替用户点击重新生成分镜或主动提交真实模型验收。
