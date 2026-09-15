# 项目导航与开发约定

## 系统是做什么的

本系统是“AI 短片导演工作台”，帮助创作者把一句话创意逐步制作成 AI 短片。主要流程为：**一句话创意 → 故事方案 → 剧本 → 分镜 → 图片/视频素材生成 → 配音与剪辑 → 导出**。用户可以在各环节预览、修改和确认内容，不是提交一句话后完全无人干预的一键成片系统。

工作台以“项目、分镜、资产”为中心，管理故事版本、人物/场景/风格等资产、提示词、模型配置和生成任务；通过外部 AI 模型服务生成文字、图片、视频和配音，也可通过桌面端的豆包 Chrome 插件操作豆包网页生成视频并回传素材。成片交付支持剪映草稿及离线剪辑包，最终视频由相应剪辑/渲染工具输出。

产品由共享的 Web 界面/API、Electron 桌面端和 Chrome 插件组成。桌面端在本机运行后端并保存项目与素材，提供浏览器任务管理、本地文件操作和软件更新等能力；网页端与桌面端复用业务源码，但不自动同步用户数据，也不会因修改 Web 源码而自动更新已安装的桌面程序。

## 开始工作先读

1. [最新开发交接](docs/development-handoff.md)：当前版本、主要改动、Git 同步记录、运行与发布现状、待验证事项。新对话首先阅读。
2. [代码库架构地图](docs/project-architecture-map.md)：技术栈、目录、业务调用链、数据库和模块职责。是历史侦察记录，时效性以交接文档及当前源码为准。
   - 账号授权开发先读 [账号授权与管理员后台方案](docs/access-control-design.md)，UI Demo 见 [预览说明](docs/prototypes/access-admin/README.md)。中央第一阶段已部署，桌面门禁源码已完成但未发布安装版；实施前同时阅读 [部署与运维](docs/access-control-deployment.md)。
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

## 账号授权与管理员后台（2026-09-15 用户确认范围）

- 按“满足系统要求、保留适当迭代余量、不要过度设计”实施。首期仅路人、普通会员、超级管理员；账号＋密钥登录，有效且未封禁的会员全功能使用，路人/到期/封禁仅见登录和状态提示。
- 普通会员保留现有创作、收益/渠道账本、模型设置等全部业务功能，按账号隔离自身数据；不得借授权开发擅自降级原功能。仅平台用户管理、全平台统计及管理员审计属于超管。
- “管理员后台”紧接“系统设置”，仅超管可见，API/桌面 IPC 同时鉴权。超管可新增会员、设定账号/密钥/期限、封禁/恢复、查看当天/历史使用和操作日志；不得删除用户记录。到期保留历史，恢复不自动延期、延期不自动解封。
- 大盘仅汇总事件发生时普通会员的数据。用户补充确认：导出视频数统计系统成功导出的视频文件，区分分镜视频与最终成片；首期接入已有分镜视频导出，已有文件再次定位不重计，最终成片未接入时仅该子项说明限制。草稿/剪辑包不能当视频；不编造旧使用历史。
- 密钥保存安全摘要，管理员变更与日志一起落库，不记录凭据明文；保留旧数据并明确归属。中央授权与桌面回环 Cookie 保护分开，登录不等于作品跨设备同步。
- 方案见 docs/access-control-design.md；联网频率、会话时长、技术栈、密钥长度等是实现建议，不冒充用户已确认要求。首期中央四表即可，不提前做钱包、订单、套餐、复杂权限矩阵、统计缓存或分布式架构。
- docs/prototypes/access-admin/ 仅内存 Demo：默认登录，review=1 才有评审快捷入口；演示账号/密钥、角色切换和示例数据不得进正式版本。审阅修订见 docs/access-control-review.md，原型通过不代表正式鉴权已开发。

- 中央服务独立源码在 `services/access-control/`，Node 24.21.0 / TypeScript / SQLite，服务端 `https://121.199.40.214/access`。部署路径、systemd、备份、初始化凭据读取方式见 `docs/access-control-deployment.md`；不得把凭据内容写入文档或源码。第三阶段中央管理员接口已部署；桌面门禁和管理员界面已实现并通过隔离联调，尚未发布新桌面版本。不能据此声称已安装旧版获得新权限控制。

- 桌面第二阶段实现与验证见 `docs/access-control-desktop.md`；登录前只启动空壳库，用户资料位于 accounts/<中央UUID>，旧工作区须明确认领且保留原件。不同账号切换需安全重启。独立 Web 多用户归属未实施，其旧单用户 API 默认拒绝；不得为预览方便移除门禁。

- 第三阶段后台见 `docs/access-control-admin.md`；正式 UI 必须对齐 `docs/prototypes/access-admin/` 已批准 Demo（三页签、表格/卡片/弹窗、深浅主题）。只做真实数据与必要加载/错误/空态适配，不随意另起设计。第四阶段统计已接入，只保留最终成片子项未接入提示，不使用示例数字。桌面发版属第五阶段。

- 第四阶段见 `docs/access-control-usage.md`：中央 `/usage/events`、schema v2 clock_status；桌面仅一张 `desktop_usage_events`，业务事务记事件，主进程按原账号批量上报。所有素材写入用 `lib/usage-server.ts` 统一记数；桌面导入项目必须保留 `x-director-import:1`，旧项目不追溯。视频导出只对created=true计数，发布日志与临时文件用于崩溃恢复，不随意清理。服务器现行版本见运维文档，不能将v2库直接交给旧v1程序启动。

## 0.1.70 双端交付约定

- 最新交付见 [第五阶段交付](docs/access-control-delivery.md)：Mac与Windows共用 `desktop/build/stage-runtime.mjs` 白名单和业务runtime；Mac执行 `desktop/package-mac.mjs`，Windows执行 `desktop/package-windows.mjs`。不可只向一个平台拷贝新增业务模块。
- Mac为本机源码启动，Windows为NSIS包。0.1.70已生成并通过Mac隔离验证；用户暂无Windows实机，Windows安装/升级/NTFS导出实机验收待完成。用户随后明确授权公开发布0.1.70，Windows更新渠道已上线；不要把发布成功等同于实机验收通过。
