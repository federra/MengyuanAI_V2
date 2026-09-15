# 桌面账号门禁：第二阶段实施记录

2026-09-15。**第二阶段源码与隔离测试完成；尚未替换正在运行的桌面程序或发布新安装包。**中央服务沿用第一阶段部署，接口见 [服务器手册](access-control-deployment.md)。当前真实桌面发布版本仍为 0.1.69，统一构建交付时依 desktop/AGENTS.md 递增版本。

## 一、实现内容

- `desktop/access-session.cjs`：固定 HTTPS 基地址，账号＋密钥登录；中央 token 只在主进程内存，不进 preload、Cookie、localStorage或磁盘。每个业务请求在线校验；仅合并同时发生的校验，不缓存一段时间的授权。退出与迟到校验响应通过递增代次隔离，防止退出后被旧响应重新登录。
- `components/access-gate.tsx`：先渲染登录页，成功后才挂载原 Workbench。浅/深主题、凭据错误/到期/封禁/断网提示；15 秒心跳及窗口焦点检查。授权失效卸载业务，原生工作台菜单也隐藏。普通会员原有创作、模型、收益/渠道功能保留；管理员后台入口第三阶段再接。
- `desktop/worker.mjs` → Miniflare service binding → `desktop/backend.mjs` → 主进程 IPC：检查中央身份与该后端绑定的 owner ID，再放行业务 API及媒体，包括 Range 与图片代理。原回环 Cookie 和同源校验保留。API响应禁止缓存；敏感桌面 IPC、目录/导出/豆包操作和原生菜单也校验。
- 原始独立 Web 库尚无多用户归属迁移。本轮面向用户实际使用的桌面形态，`middleware.ts` 对未配置桌面可信环境的独立 Web 业务接口默认拒绝，页面提示使用桌面。**没有把共享源码误当成已经支持多用户云端 Web**；后续启用独立 Web 时必须另行落实同源中央会话与 owner_user_id，不得直接移除拒绝逻辑公开旧单用户库。

## 二、账号数据与旧资料

登录前使用 `userData/login-shell` 空壳目录，不打开旧工作区。首次登录在 `userData/accounts/<中央用户UUID>/` 创建账号根目录，保存 owner.json、模型加密密钥、独立目录设置、豆包资料与插件副本；默认业务数据库和媒体位于该账号根下的 workspace。导出图片/视频也按中央 UUID 分目录。

发现旧 workspace（含旧目录设置指向的位置）或 doubao-data 时，明确选择“新建空工作区 / 认领旧工作区 / 取消登录”。认领复制项目、媒体、模型加密密钥、豆包数据及剪映目录设置；**原文件保留**。操作前关闭旧工作台和旧豆包浏览器，避免复制正在写入的数据库。`accounts/legacy-owner.json` 记录唯一认领人，不自动分给第一个登录账号，也不允许另一账号再认领。

复制在独立 `.prepare-*` 目录完成后改名生效；失败不删除源目录。若认领中断，保留认领标记和暂存目录，同一账号可重试，其他账号不能夺取该旧数据。需要维护处理时先确认 owner 与原目录，不能清空整个 accounts。已创建空工作区后，不自动合并旧资料，避免覆盖新创作；后续数据迁移须单独处理。

首期单进程固定绑定一个账号。同账号到期续期/解封后可重新登录；切换不同账号需完成当前任务后重启软件，中央验证通过后才打开其目录。不存在两个账号共享同一运行中数据库或豆包调度器的路径。自定义目录变更沿用原机制，在下次启动该账号工作区前复制迁移，旧目录保留。

## 三、未保存内容与任务收尾

- Workbench 当前未保存项目在变化后及卸载时写本账号 `recovery.json`，主进程序列化、临时文件改名保存；下一次登录询问是否恢复为待保存草稿，不直接覆盖数据库。此快照不包含模型密钥或中央凭据；它不是所有弹窗临时输入的完整历史版本库。
- 已进入文字 AI /导演接口的响应分支持续读取，备份在该账号 workspace/completed-results，每条 JSON包含时间、接口和响应（流式结果含 progress/result 记录）。即使页面因授权失效卸载，也保留原账号的返回文本供恢复；已授权用户通过侧栏“查看生成备份”打开本地目录。该备份不自动套用到可能已变更的剧本。
- 逐请求鉴权阻止新的模型提交；豆包队列命令、获取待提交任务、submissionIntent和确认提交都校验。已提交豆包任务的回执仍可保存。
- 主进程另生成不暴露给页面的内部随机凭据。受限通道只允许 POST /api/media 保存返回素材，或对数据库中已有 remote_id 且 running 的任务执行 refresh。授权失效期间，后端每15秒对这些已有任务做收尾查询，不执行 submit/create；结果保存在原账号 D1/R2，后续登录读取。未结束的供应商任务ID持久保留，程序退出或网络中断后可继续查询。
- 主动退出/切换前拦截正在处理的HTTP流、导出、豆包提交/下载以及前端生成任务。普通关窗依然沿用保存/退出确认与有序关闭；无法保证供应商在程序关闭后继续向已关闭的本地进程交付，重开后依任务ID恢复。

## 四、本轮验证及复现

已执行：`pnpm build`；根 TypeScript检查；新增模块与登录组件定向 oxlint；会话、账号目录认领、到期豆包权限单测；既有豆包管理与 shutdown 回归。独立中央服务使用自己的 tsconfig，不再混入根 Web 类型检查。

真实 Worker 集成测试覆盖：回环保护、登录前401、已授权项目保存/冲突与跨进程持久化、媒体及 Range 授权、模型加密配置、内部凭据不能创建任务/读取项目、文字接口响应备份落盘。全部使用临时数据库，文字请求使用无效输入验证收尾记录，不调用真实模型。

真实 Electron 测试覆盖：登录前无工作台、直接HTTP与IPC拒绝、实际表单登录、浅深主题、普通会员进入收益中心、封禁/断网隐藏工作台、重新登录恢复草稿。测试在 `desktop/test-results/access-stage2-build` 构建副本和系统临时 userData 下运行，授权 HTTP 用测试替身控制状态，**没有使用真实会员/管理员密钥，也没有调用真实 AI 或豆包额度**。第一阶段真实 HTTPS 登录验证记录仍见服务器手册，不冒充本轮真实账号桌面联调。

核心测试命令：

```sh
node desktop/test-access-session.mjs
node desktop/test-account-workspace.mjs
node desktop/test-access-doubao.mjs
node desktop/test-doubao-manager.mjs
node desktop/test-shutdown.mjs
node desktop/test-results/access-stage2-build/test-backend.mjs
desktop/node_modules/.bin/electron desktop/test-access-ui.mjs
```

最后两条需先准备独立副本：复制 desktop 必要源码/package.json/插件/模板，将成功构建的 dist/server、dist/client、drizzle SQL 放入该副本的 runtime；将 desktop/worker.mjs 放为 runtime/server/desktop-entry.mjs，并提供桌面依赖。不要为测试覆盖正在运行版本的 runtime。Electron 脚本支持 DIRECTOR_ACCESS_STAGE 指定副本路径；测试中的授权替身仅存在测试脚本，不在生产登录开关中。

未完成的交付验收：Windows实机、真实中央账号的桌面端联调、旧真实工作区认领、真实供应商在授权失效后的回执场景、新安装包与版本发布。后续第三阶段开发管理后台，再于第五阶段统一完成桌面交付和实机验收。
