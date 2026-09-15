# 项目导航与开发约定

## 开始工作先读

1. [最新开发交接](docs/development-handoff.md)：当前版本、主要改动、Git 同步记录、运行与发布现状、待验证事项。新对话首先阅读。
2. [代码库架构地图](docs/project-architecture-map.md)：技术栈、目录、业务调用链、数据库和模块职责。是历史侦察记录，时效性以交接文档及当前源码为准。
3. 按任务阅读专题：
   - [桌面开发与版本约定](desktop/AGENTS.md)、[桌面说明](desktop/README.md)
   - [软件更新与 Windows 安装包发布](desktop/UPDATES.md)、[本版更新说明](desktop/release-notes.md)
   - [豆包工作流排查](docs/doubao-workflow-review.md)、[原视频接收规则](desktop/DOUBAO-ORIGINAL-MEDIA.md)、[插件开发说明](browser-extension/开发说明.md)
   - [剪映导出](desktop/JIANYING-EXPORT.md)

## 工作边界

- 默认中文交流，回复以“跪呈南哥批阅：”开头并换行；结论先行、用词直白、避免重复和不必要的长列表。
- 开工先检查 `git status --short`、当前分支和相关源码；保留现有未提交修改，不因新任务重置或覆盖它们。
- 一套 Web 页面/API 供网页与 Electron 桌面复用。修改源码不等于更新正在运行的桌面版；桌面必须重新构建 runtime、准备独立版本并重启。桌面版本以 `desktop/package.json` 为准，遵守下级 `desktop/AGENTS.md`。
- 插件唯一源码在 `browser-extension/`；不要只修改 `desktop/doubao-extension/`、`desktop/runtime/`、`dist/` 或 `desktop/release/` 内的生成副本。
- Git/GitHub 仅提交必要源码、配置、锁文件、测试及文档。不要提交媒体、缓存、依赖、发布包、用户数据库、Chrome 配置、日志、密钥和服务器凭据。安装包仅包含程序与必要运行依赖/资源，不混入用户数据。
- 不清空用户数据、不删除旧发布目录、不覆盖运行中的程序。临时测试使用独立数据目录；真实模型和豆包任务可能消费额度，按用户授权范围执行。
- 检查更新功能存在不代表服务器已发布版本。发布、上传、提交、推送需按本次用户任务范围执行；不要把历史授权自动视作每次新开发都要上线。
- 不推送 `codex/legacy-main-20260915` 历史分支；它保留了旧二进制历史。当前源码基线和远端见交接文档。
- 按改动范围运行相关测试与构建，明确区分源码实现、模拟测试、实机验证和已发布状态。交接文档中的验证记录不是本轮测试结果。

## 快速定位

`app/page.tsx` 工作台编排；`components/creative-workspace.tsx` 创意/故事/剧本；`lib/studio.ts` 项目数据；`app/api/` HTTP 接口；`db/schema.ts` 与 `drizzle/` 数据结构/迁移；`lib/model-server.ts` 模型请求；`lib/generation-server.ts` 图片/视频任务；`desktop/main.cjs` 桌面入口；`desktop/doubao-manager.cjs` 豆包调度；`browser-extension/background.js` 网页自动化；`desktop/software-update.cjs` 软件更新。

重大模块、版本或发布状态变化后更新 `docs/development-handoff.md`，不要只在对话中留记录。文档使用仓库相对路径，便于 Windows 同事及新工作区查阅。
