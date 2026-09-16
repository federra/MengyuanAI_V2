# 创作工作台调整与分镜导入修复

日期：2026-09-16。初次交付为源码验证；用户后续已确认并授权作为0.1.72打包发布，最终发布状态见开发交接。以下验证保留各阶段边界。

## 改动

- 故事工作区底部：AI 生成故事、另存故事方案放左下；剧本 Skill、Skill 中心、“确认故事，进入剧本”放右下。两组内部保持横向排列，窄窗口允许组间换行。
- `lib/model-server.ts` 的模型 HTTP 请求统一最多等待 600 秒，覆盖文字、图片、视频、音频；生成素材下载也使用此值。异步任务可跨多次请求完成，600 秒不是任务总寿命；豆包网页追踪和鉴权等待保持原含义。
- `lib/storyboard-episodes.ts` 支持文本、数字及对象形式的 `source_refs`，保留完整来源对象；来源及整段分镜说明各受 10000 字符上限约束，不静默截断。旧逻辑把每项来源限制为 150 字文本，导致长来源及结构化来源被拒绝。
- `lib/director.ts` 支持按人物、场景、道具等分类的 assets 对象，转换后仍执行原有字段检查和总计 200 项限制；null 视为空。未知类别及非法结构继续报错。解析器由 Mac、Windows 共用。
- Skill 下载增加 JSON、TXT、MD、ZIP 格式选择。TXT/MD 含名称、阶段和版本元信息；ZIP 仅存一份 `SKILL.md`，避免重复正文导致合法长技能无法重导。
- 新增 `lib/skill-files.ts`，用 fflate 解压 ZIP。支持主文件 `SKILL.md` 或 `skill.json` 与配套文本，交给已有质检及必要的 AI 适配流程。ZIP 最大 5MB、最多 100 个条目、解压文本合计最多 100KB；拒绝路径穿越、多技能歧义及损坏文件。非文本资源仅提示存在，不执行脚本。

## 验证

- 用户提供的 `storyboard-converted.json` 解析并应用到新项目，通过项目校验：12 个视频段、31 个子镜头、19 项资产。原文件未复制到代码库。
- 该 JSON 未含 assets 字段，直接复现的是过长来源引用；另一截图显示对象形式来源。assets 分类兼容通过独立用例验证，未拿到原始 assets 失败文件。
- `node tests/core.mjs`、`node tests/episodes.mjs`、`node tests/skill-files.mjs`、`node tests/skill-quality.mjs`、`node tests/models.mjs` 通过；覆盖结构化来源、分类资产、四格式往返、20000 中文字符技能 ZIP 往返、压缩包边界及四类模型请求的 600 秒配置。模型测试使用模拟服务，不消耗真实额度。
- `pnpm exec tsc --noEmit`、相关文件 oxlint、`pnpm build` 通过。
- `desktop/test-workspace-adjust-ui.mjs` 使用隔离运行目录和临时用户数据验证真实 Electron 界面：故事操作区左右分组、四格式实际下载、ZIP 走真实导入 API 通过质检且不调用模型，并检查双主题导入界面。
- Windows 实机尚未验收。本轮没有生成新版本号、Windows 安装包或上传发布渠道。

## 后续

用户确认后按桌面版本约定生成独立新版并打包；不要用源码测试状态替代已安装桌面版或 Windows 实机验收。
