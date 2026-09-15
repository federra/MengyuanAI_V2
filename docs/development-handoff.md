# 开发交接：AI 短片导演工作台

更新日期：2026-09-15（Asia/Shanghai）。目的：让新的 Codex 对话理解现有工程并接续开发新模块。本文记录交接时状态，不保证未来进程、远端或发布目录仍相同；开工应核对 Git 和实际文件。本文不包含服务器密码或模型密钥。

## 一、接手时最重要的事实

- 产品从“一句话创意”逐步生成故事、剧本、分镜和素材，最后导出剪映草稿/剪辑包。用户有基础开发能力、懂业务；解释要直白，主动完成已授权工作。
- 当前桌面源码与本地交付版本 **0.1.69**，豆包插件 **0.13.4**。根 `package.json` 的 0.1.0 不是桌面版本。
- 当前分支 `main`；v0.1.69 功能提交 **f25e654** 已于 2026-09-15 成功推送至 `origin/main`，前一基线为 **9824ced**（v0.1.68）。远端 `git@github.com:federra/MengyuanAI_V2.git`。本文与根 AGENTS.md 在后续文档提交中记录此次交接；最新提交号以 `git log -1` 为准。
- **v0.1.69 软件更新源码、测试、构建配置及更新说明已提交并推送 GitHub。** 安装包和用户数据未入 Git。新对话仍先 `git status --short`，保留交接后可能产生的修改。
- 本地已构建 Windows x64 NSIS 安装包，**未上传服务器**；软件更新服务器尚未发布真实版本清单。Windows 实机安装、跨版本自动升级尚未验收。
- Mac 采用源码运行形式，不是已签名的正式 `.app` 安装发行版。按用户明确选择，**Windows 支持下载安装，Mac 先检查版本/查看说明**；Mac 当前展示的是 Windows 发布版本，非独立 Mac 更新通道。

本机工程目录 `/Users/nathan/Codex_Projects/ai-director-studio`。v0.1.69 最近启动日志：2026-09-15 04:43:57 UTC（北京时间 12:43:57）记录 `Desktop started. Version=0.1.69`、`Local workspace ready.`；只是当时启动验证，不保证后来没有关闭。

## 二、架构与主要改动

### 1、工程关系

详细地图见 [project-architecture-map.md](project-architecture-map.md)。React 19 + TypeScript + Tailwind 4，vinext/Vite 使用 Next 风格 `app/` 目录；API 运行于 Workers，D1/SQLite 存结构数据、R2 存媒体，Drizzle 管理表定义和迁移。桌面 Electron 44.3.0 启动 Miniflare 本地后端，复用同一套页面/API，数据与 Web 开发环境分开。

主链：`components/creative-workspace.tsx → app/page.tsx → app/api/ai/route.ts → lib/model-server.ts → 外部文本模型`；生成媒体走 `lib/generation-server.ts` 与 `generation_jobs`。项目是 `lib/studio.ts` 定义的 JSON 文档，包含故事、分镜和资产；数据库结构见 `db/schema.ts`。没有统一 Redis 任务队列或自动跨设备项目同步。

豆包链：`工作台 → preload IPC → desktop/doubao-manager.cjs → Chrome 独立账号配置 + browser-extension/ → 豆包网页生成 → 身份核对/官方导出 → 桌面下载 → /api/media → 回填原项目分镜`。插件负责页面操作和结果采集，不生成视频，也不是通用模型 API。该自动化通道依赖桌面管理器，不能把浏览器内打开工作台等同于拥有完整豆包桌面能力。

### 2、接手后的已提交改动

| 范围 | 当前行为及关键依据 |
|---|---|
| Mac Chrome 发现（.58） | `desktop/doubao-chrome.cjs` 增加 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` 与用户 `~/Applications` 路径，保留 Windows 查找逻辑；`desktop/test-chrome-path.mjs`。 |
| 豆包长期等待（.59） | 提交满 3 分钟释放账号/全局调度槽，原任务继续追踪；3 分钟不是生成失败时限。待核对任务可“取消追踪”，仅停止本地关联，不撤销网站生成；取消后忽略晚到结果。见 `desktop/doubao-manager.cjs`、`components/doubao-task-records.tsx`、`desktop/test-doubao-slot-timeout.mjs`。 |
| 视频已生成却不回传（.60） | 成品卡可能直接内嵌视频信息，点击不再产生旧逻辑等待的播放请求。`browser-extension/result-identity.js` 从原对话匹配消息提取唯一视频编号，再查询官方播放信息；身份不明不借用别的任务视频。见 `observer.js`、`forwarder.js`、`tests/doubao-result-identity.mjs`。 |
| 官方水印设置（.61） | 接入豆包官方“去除 AI 生成明水印”配置及成品导出。AI 明水印与豆包品牌水印不同；仅在官方结果与任务身份符合规则时接收，不能简单把任何带品牌标识的视频判失败。见 `browser-extension/watermark-policy.js`、`configure-watermark.js`、`tests/doubao-official-watermark.mjs`。 |
| 无并行任务却排队（.63） | 管理器从插件 manifest 读取期望版本；插件重新核对桌面持久化更新指令，避免旧目标版本导致循环重载/不派发。见 `desktop/test-doubao-update.mjs`、`tests/doubao-extension-update.mjs`。 |
| 深色主题（.64） | 保留浅色样式，增加右上角切换并持久化偏好。见 `components/theme-toggle.tsx`、`lib/theme-preference.ts`、`app/globals.css`、`tests/theme-preference.mjs`。 |
| 创作工作流（汇总于 .68） | 故事卡可点击预览正文；确认故事后明确调用生成剧本，传入所选故事快照，避免 React 状态未刷新时读取旧故事。见 `components/creative-workspace.tsx`、`app/page.tsx::generate`、`lib/creative.ts`。 |
| 创作参数（汇总于 .68） | 上方重复故事 Skill 改为故事篇幅：500字以下、500～1000、1000～2000、2000～3000、3000～5000、5000字以上，送入 LLM 上下文与输出预算。视频类型/风格支持“自定义+”，自定义风格生成资产库风格模板。最终画幅仅下拉六项：9:16、16:9、1:1、4:3、3:4、21:9；这是对早期自由画幅需求的后续收敛。见 `lib/creative.ts`、`lib/studio.ts`、`app/api/ai/route.ts`、`lib/models.ts`、`lib/doubao.ts`。 |
| 模型等待（.68） | `lib/model-server.ts` 超时由 110 秒延长为 **240 秒**。保留错误诊断及避免重复收费的控制；不要误改成豆包的 3 分钟调度阈值。 |

Git 主线记录：`2fd2d61` 为 .63/插件 .13.4 源码快照；`1465017` 为主题；`9824ced` 为创作流程和超时。旧历史另保留于 `codex/legacy-main-20260915`，包含旧二进制历史，**不要合并/推送该分支**。早期 README、架构地图中的 .57 行为及“未接入”等文字不一定反映当前状态。

### 3、本轮软件更新功能（.69，已提交推送）

系统设置底部增加“软件更新”：当前版本、可用版本、纯文本更新内容、检查更新、下载并安装；有进度显示，区分“当前已是最新版”“更新服务尚未发布版本”和网络错误，失败不得假报最新版。浅色/深色均已验证。

- 界面：`components/software-update.tsx`；嵌入 `components/directory-settings.tsx`（标题改为系统设置、对话框增高且可滚动）；状态类型 `lib/software-update.ts`；桥类型补充于 `components/asset-image-preview.tsx`。
- 主进程：`desktop/software-update.cjs` 管理检查/下载/安装状态；`desktop/main.cjs` 与 `preload.cjs` 提供受信 IPC，只接受 get/check/install，不接受渲染层任意 URL 或执行命令。
- Windows 使用 `electron-updater 6.8.9` 的 `NsisUpdater`，安装包包含 `app-update.yml` 才启用自动安装；源码/旧便携版只检查。关闭自动下载、退出时自动安装及降级；校验版本清单一致性和 SHA-512。
- 下载完成后请求退出；保留未保存内容/运行中操作保护和豆包活动任务提示。用户取消则保留下载，可继续安装。窗口接受关闭后先停插件与后端，再 `quitAndInstall(true, true)` 静默安装并重新打开。安装交接失败有恢复提示。见 `desktop/close-window.cjs`、`desktop/shutdown.cjs`、`app/page.tsx` 的 beforeunload。
- 打包：`desktop/package-windows.mjs`、`desktop/build/windows-config.cjs`、`desktop/build/installer.nsh`；采用 `electron-builder 26.15.3`、NSIS x64、当前用户安装、不删除用户数据。`toolsets.nsis='1.2.1'` 解决 Apple Silicon 无 Rosetta 时旧打包工具不能运行的问题。首次缺少 VC++ 运行库时显示内置官方安装程序。

功能提交 `f25e654` 包含上述源码/测试/配置/说明，以及 `desktop/package.json`、`desktop/pnpm-lock.yaml`、`desktop/pnpm-workspace.yaml`、`desktop/release-notes.md`、`desktop/UPDATES.md`，共 19 个文件。提交前审计暂存清单，未包含安装包、媒体、缓存、用户数据库或私钥。本交接与根 AGENTS.md 单独提交，便于准确记录已经完成的功能提交和推送结果。

## 三、启动、构建、数据与交付

### 1、开发与启动

Node 要求 >=22.13.0；根与 `desktop/` 各有独立依赖和锁文件。Web：根目录 `pnpm dev`；通常 `http://localhost:3000/`，以实际输出为准。构建：根目录 `pnpm build`。

桌面开发：根目录构建成功后执行 `pnpm --dir desktop prepare:runtime`，再 `pnpm --dir desktop start`。`prepare.mjs` 复制 dist、SQL 迁移、worker 和插件源码到 runtime/插件副本。不要只修改 dist/runtime，或以为 Web 热更新会自动刷新已发布桌面版。

本机已交付 Mac .69 启动入口：`desktop/release/v0.1.69/启动桌面版.command`。也可在项目根执行：

```sh
open -n "$PWD/desktop/node_modules/electron/dist/Electron.app" --args "$PWD/desktop/release/v0.1.69"
```

修改桌面功能交付时至少递增 patch；新建独立版本目录、同步最新 runtime/插件、验证后再启动，不覆盖正在运行的旧版本。详见 [桌面约定](../desktop/AGENTS.md)。

### 2、用户数据和文件边界

Electron 固定名称 `AI Director Desktop`，Mac 用户目录 `~/Library/Application Support/AI Director Desktop/`，日志 `desktop.log`；默认 workspace 内为本地 D1/R2，可由系统设置改变。账号/任务在 `doubao-data/`，Chrome 账号配置及加密信息也属于用户数据，不能打包、提交或随意清理。Windows 由 `app.getPath('userData')` 解析对应目录；不要因改 productName 改动既有数据身份。

源码以 `app/`、`components/`、`lib/`、`db/`、`drizzle/`、桌面核心脚本和 `browser-extension/` 为准。`public/render.py`、图标和剪映模板是必要资源。`node_modules/`、`dist/`、`.wrangler/`、`work/`、`desktop/runtime/`、`desktop/doubao-extension/`、`desktop/release/` 等为依赖/生成或本地数据区域；其中有价值的数据不能直接当垃圾删除。根和桌面 `.gitignore` 控制排除。

### 3、本地 Windows 安装包

路径：`desktop/release/v0.1.69/windows-installer/publish/MengyuanAI-Setup-0.1.69-x64.exe`，**176,197,148 字节**，约 176 MB（168 MiB）。该路径在用户 Mac 本地，不在 GitHub。已在访达选中过供用户发送。

同目录仅有 `.exe`、`.exe.blockmap`、`latest.yml`、`release.json` 四个发布文件；`builder-debug.yml` 已移到父目录，脚本亦做相同处理。构建使用核心文件白名单、Windows 生产依赖和必要运行库；审计未发现用户媒体/数据库/缓存/账号文件，安装包 SHA-512 与 latest.yml 匹配。

完整构建方法见 [UPDATES.md](../desktop/UPDATES.md)。需准备官方 `VC_redist.x64.exe` 并设置 `VC_REDIST_PATH`，可用 `ELECTRON_ZIP_DIR` 指定官方 Electron ZIP。脚本拒绝覆盖已有同版本 staging；重打包前保留/移开对应目录，不删除用户数据。本地 .69 首次构建经历工具配置修正，最终复用 staging 构建成功，当前脚本已包含修正。

## 四、更新服务器现状与验证边界

### 1、服务器

用户选择自有服务器，不用 GitHub Releases。服务器 `121.199.40.214`，SSH 22，管理账号 root；凭据不写入代码/文档。已配置有效 HTTPS 的 IP 地址访问，**没有因此获得英文域名**。此前服务器环境为 Ubuntu 24.04 / Nginx 1.24，443 已开通，证书配置有续期机制；后续部署应重新核实。

`https://121.199.40.214/updates/` 对应独立 `/srv/ai-director-studio-updates/`，含 `windows/`、`mac/`。仅 updates 放开网站登录保护，原网站根路径/API 保持 Basic Auth；禁目录列表/隐藏文件/符号链接，允许 GET/HEAD、支持 Range，no-cache。之前 `health.txt` 外部访问验证成功。

Windows 固定地址：`https://121.199.40.214/updates/windows/release.json`（版本/说明）、同目录 `latest.yml` 和安装文件（原生更新器）。**本轮没有上传；之前真实清单为 404，因此客户端应显示未发布，而非最新版。** `mac/` 已建但未接入 Mac 原生安装发布。

后续发布顺序：Windows 实机验收 → 上传版本化 exe/blockmap 并核对校验值 → 临时文件上传并原子替换 latest.yml → 最后替换 release.json → 外部验证。不得只上传虚假版本清单；不要上传整个 staging、debug、缓存或凭据。保留旧安装文件，不靠降低版本回滚。更多细节见 [UPDATES.md](../desktop/UPDATES.md)。

### 2、已有验证与未完成部分

本轮 .69 已执行成功：`pnpm build`；`node desktop/test-software-update.mjs`；`node desktop/test-shutdown.mjs`；更新/设置组件定向 oxlint；真实 Electron 使用隔离用户目录的启动 smoke；模拟更新源/安装器的 `desktop/test-software-update-ui.mjs`（版本、离线、未发布、取消/继续安装及深浅主题）；实际 NSIS 构建、最终包版本/大小/SHA-512 检查。测试不是实际 Windows 安装器运行。

待办/限制：

1. **Windows 实机首次安装和旧安装版升级**、下载中断、安装失败恢复、项目及模型配置保留，仍待验收。同事手上的旧便携版需先人工安装一次具备更新组件的 NSIS 版。
2. 安装包尚未配置代码签名，Windows 可能显示来源警告；正式签名时同步发布者设置，不能绕过验证。Mac 正式签名/打包/自动安装不在本次范围。
3. 服务器尚无可用更新发布；.69 源码已推送 GitHub，但这不等于上传安装包或发布更新服务。后续上线仍需按用户任务范围执行。
4. 豆包依赖持续变化的网页/官方接口；历史有真实账号读取和既有视频导出验证，但不能称所有新生成端到端路径都已稳定实测。其他模型供应商、剪映版本、备份/恢复也未全面审计。
5. `desktop/test-software-update-ui.mjs` 当前引用本地 `release/v0.1.69`，新克隆没有生成目录时不能直接运行；应先准备匹配 runtime 或按后续任务改为参数化。不要把缺少本地产物误报为业务回归。

## 五、新对话接续方法

先读根 [AGENTS.md](../AGENTS.md) 与本文，再根据新模块阅读 [架构地图](project-architecture-map.md) 和关联源码。检查分支、未提交差异与运行版本；本轮更新功能是用户已认可的现有工作，应保留。新模块未指定，不预设其范围。

常用验证入口：`node tests/core.mjs`（会在 work 写转译产物）、`node desktop/test-software-update.mjs`、`node desktop/test-shutdown.mjs`；创作变更看 `tests/creative.mjs`、`desktop/test-creative-workspace.mjs`，豆包按专题选择对应回归。涉及桌面界面的验证需要 Electron 和本地监听权限。只跑与改动相关的测试，必要时执行构建，不为测试擅自提交真实模型/豆包生成任务。

交付时清楚说明：修改了什么、验证了什么、实际运行/安装的是哪个版本、是否提交推送、是否发布服务器。不要将“源代码完成”“本地安装包生成”“同事实机验证”“服务器已发布”混为一谈。
