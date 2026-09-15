# Windows desktop test build

## macOS Chrome discovery · 0.1.58

The desktop Chrome locator now checks `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`, then `~/Applications/Google Chrome.app/Contents/MacOS/Google Chrome` on macOS. Windows installation lookup is unchanged. Save the current project and restart the source-run desktop application to load this change; previously packaged apps need a new package. This fixes browser discovery only and does not certify the complete Doubao generation flow or other Windows-specific desktop features on macOS.

Verification: `node desktop/test-chrome-path.mjs` covers both macOS locations, paths with spaces, Windows fallback locations and missing installations. `node desktop/test-chrome-install.mjs` checks the existing launcher using simulated browser responses; it does not submit a real generation task.

Desktop 0.1.57 / extension 0.13.0: each account now retains a single task until a terminal result and fresh idle confirmation. A generation acknowledgement no longer permits a parallel submission on that account. All submitted tasks (including timed-out tasks) are tracked in their saved original conversation before creation-form checks. Missing original tabs are reopened for result collection only. Submission, identity and result notifications are persisted together and replayed after worker restart or a temporary desktop outage. Video recognition supports absent/partial message IDs using the saved conversation and response text; ambiguous cards are rejected. A video card is not considered a successful download until the workbench returns a saved-media receipt.

Generation now requires explicit account-group selection before the task preview; only enabled accounts from that group enter its round robin. The storyboard retains the chosen group. A timed-out observer with a saved original conversation can update without discarding its task. New account browser sessions load extension 0.13.0 and enable developer mode. These behaviors have automated manager/bridge and local Chromium fixture coverage; they have not been verified by submitting a new video to the user's live Doubao account.

The desktop app runs the current production Worker locally using Miniflare, with persistent D1 and R2 under Electron userData. It does not connect to the deployed Sites database. AI calls go through the existing model routes with locally configured provider credentials.

## Development

Build the parent application with `pnpm build`, then in this directory:

```powershell
pnpm install
node node_modules/electron/install.js
node prepare.mjs
pnpm start
```

The desktop directory has its own dependency workspace; the website dependency lockfile is unchanged. Use the pinned Electron and Miniflare versions. Electron downloads are checked against the package's SHA-256 checksums. `ELECTRON_ZIP_DIR` can point at a directory containing the verified official Electron archive for packaging without another download.

## Package

```powershell
node package.mjs
```

The output is a portable Windows x64 folder. Keep the executable and all adjacent resources together. Optionally set `DIRECTOR_RELEASE_DIR` to a new output directory; existing builds are not overwritten. This testing build is unsigned.

## Verification

`node test-backend.mjs` exercises actual local Worker routing, schema migrations, authenticated loopback requests, project revision conflicts, uploads and data/config persistence through a backend restart. It uses a fake key and never calls a model provider.

Set `DIRECTOR_SMOKE_DIR` to an isolated absolute test directory and launch the Electron app or packaged executable with `--smoke-test`. It verifies a real rendered workbench, local API access, disabled renderer Node access and DPAPI-protected key initialization, then records a screenshot/result and exits. Test data never shares the normal workspace.

## Local lifecycle and data

Desktop 0.1.32 handles Electron's `will-prevent-unload` with an explicit leave/stay dialog. Cancelling a dirty-window close or menu quit keeps the backend alive. Cleanup starts at `will-quit`, after all windows have accepted closing, drains helper writes and aborts in-flight result transfers with recoverable task records, then requests backend disposal. A five-second deadline remains active even if IPC fails; on Windows it terminates only the owned backend process tree before exiting. Normal Chrome/account windows are outside this process tree. Logs include the version/PID, close decisions, shutdown stages and timeout fallback. Run `node test-shutdown.mjs` and launch `test-close-window.mjs` with an unpackaged Electron binary to exercise the lifecycle in an isolated hidden window.

- The app owns a hidden backend child process and closes it on exit. The backend exits when its parent disconnects.
- Each launch uses a random loopback port and session token. API routes require the application cookie and same-origin requests; there is no LAN listener.
- The renderer is sandboxed with Node integration off and context isolation on, following [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security). Only local clipboard writing is permitted.
- A randomly generated model-encryption key is protected with Electron safeStorage (Windows user protection); no cloud secrets are packaged.
- Real project/media/config persistence uses the [Miniflare storage APIs](https://developers.cloudflare.com/workers/testing/miniflare/storage/d1/). Existing SQL migrations apply transactionally once.
- Project JSON import creates a new local project and strips unavailable cloud media handles/history. Media must be re-uploaded; JSON is not a media backup. It does not copy API credentials.
- No production deployment is required for desktop-only changes. Rebuild the parent application and prepare a new runtime to include future web changes.

## Doubao account browsers

Desktop 0.1.54: acknowledged video submissions now respect the configured result timeout and become awaiting reconciliation, preserving request identity and account protection. Re-reading an old acknowledgement cannot reactivate a timed-out task. Storyboard activity follows the selected generation channel; a cancelled task is not masked by another channel's older running task. Awaiting reconciliation offers original-result recovery instead of labelling the video generation itself as failed. Browser extension remains 0.12.9.

Desktop 0.1.53 / extension 0.12.9: result polling can associate a completed video with the persisted generation response in its exact original conversation when the original prompt is unmounted. Playback metadata capture supports both fetch and XHR, and both existing video/media playback endpoints. A completed result page running old hooks refreshes once per extension build before probing; running generation pages are not refreshed. Card detection and bridge errors are recorded separately from successful download/return. Regression fixtures cover association, request transport, update and failure handling; they do not prove that an individual live provider result has downloaded. Known watermarked source URLs remain rejected.

Desktop 0.1.50 / extension 0.12.7: raw-image downloads take precedence over display/thumbnail sources; known Doubao CDN video watermark presets are corrected in extraction, manual download and cached-result recovery. Unknown watermarked variants are rejected. See [original-media findings and verification](DOUBAO-ORIGINAL-MEDIA.md). Existing downloaded files are retained.

Desktop 0.1.49 / extension 0.12.6: after the original video downloads and the workbench returns a persisted media ID, the extension closes that task's original tab. The last task tab closing also closes its browser window. Other tasks and unrelated tabs remain open. Download/return failures retain the original page for recovery, and a failed tab-close retries without generating again. The helper provides account-scoped receipt status; tab closure requires matching job/request IDs and an unchanged tab URL.

Desktop 0.1.48 / extension 0.12.5: a response matched to the current prompt that says the video is generating or will be delivered later records the actual Seedance model and remains submitted without an elapsed-time failure. Unconfirmed timeouts show “待核对”. Confirmed waiting videos retain their original tab/request mapping while an independent next job opens a separate creation tab, within the configured total concurrency and quota. Previous-shot tail-frame references must already be bound; submissions that depend on another queued/running shot are rejected until its video and tail frame are ready. Restart preserves confirmed waiting records. Tests use mock provider/page fixtures and do not submit real generation.

From desktop 0.1.31, account “打开登录” launches the installed Google Chrome with the account's existing isolated profile. The wrapper uses a private DevTools pipe and `Extensions.loadUnpacked` to load the bundled extension from the stable userData/doubao-extension path, then opens the one-use local pairing page. Chrome 137+ removed the old `--load-extension` flag from branded builds; the supported CDP installation method is used instead. No debugging TCP port, registry policy or changes to the user's normal Chrome profile are needed.

The process is reused for subsequent opens without reloading a working extension. On browser restart, the extension is automatically loaded again; profile data and extension storage remain in place. Close the account's old window once when upgrading from a version without this pipe. Unsupported Chrome versions report an actionable update message. Pairing is separate from confirming Doubao login and opting an account into tasks.

`node test-chrome-install.mjs` checks installation ordering, isolated profiles, serialized reopening and failures. With `DIRECTOR_CHROME_INSTALL_LIVE=1`, it also starts the installed Chrome headlessly in a new temporary profile, loads the real extension and verifies its loopback pairing request and profile restart. The test rejects pairing deliberately and never opens Doubao, logs into an account or submits generation.

Paid settlement and automatic cloud/local sync are not implemented by the desktop wrapper.

From desktop 0.1.35, each isolated account open also enables the Extensions page developer-mode switch through Chrome's own profile configuration API and verifies it. Chrome writes its own preferences; the app does not edit a running profile on disk. A temporary background settings tab is closed after verification. This only applies to account profiles created by the workbench. The live Chrome install test checks persistence after the test browser exits.

## v0.1.59：豆包任务占用兜底

- 从已捕获的原始提交时间计时，满 3 分钟释放账号及并发槽位；不改成失败，旧任务继续按原请求和对话收取结果。重启、重新获取不会重置这 3 分钟。
- 待核对任务可点击“取消追踪”，确认后取消本地记录的追踪并释放占用；不会停止豆包网站生成，也不会退还次数或自动回填晚到结果。原对话保留。
- 下一任务使用独立创作页；仍检查新页空闲、登录、暂停、分组、额度和镜头依赖。超时释放不保证豆包服务端接受并发生成。尚未捕获提交时间的任务可人工取消追踪。
- 本机测试目录：`desktop/release/v0.1.59/`，保存并退出旧桌面端后双击其中的 `启动桌面版.command`。此目录使用本项目已安装依赖，不是独立分发安装包。助手版本为 0.13.1，需在 Chrome 加载新版助手后生效。
- 回归：`desktop/test-doubao-slot-timeout.mjs`、`tests/doubao-slot-handoff.mjs`；原调度、等待、结果恢复、标签页隔离、更新测试及生产构建通过。未自动提交真实豆包生成任务。

### 豆包成品身份识别修复（桌面 0.1.60 / 助手 0.13.2）

实测原任务已生成，但成品卡片已有内嵌播放数据，点击不再触发旧采集逻辑等待的 `get_play_info` 请求。新增 `browser-extension/result-identity.js`：只在原对话、已匹配的完成消息内读取唯一视频编号；`background.js` 将编号关联原任务，`forwarder.js`、`observer.js` 按编号查询官方播放信息，不重发生成。缺失/冲突身份继续保留原任务，绝不借用其他消息的视频。真实任务验证已正确识别编号并返回“接口仅提供带水印版本”的明确状态，取代无限等待；现有无水印接收规则保持不变。

回归：`tests/doubao-result-identity.mjs`、`tests/doubao-embedded-playback.mjs`，以及原播放抓取、结果恢复、任务隔离、水印边界和三分钟释放测试。

### 官方去除 AI 生成明水印（桌面 0.1.61 / 助手 0.13.3）

提交视频前，通过豆包官方账号设置确认“去除 AI 生成明水印”；未开启时自动开启并回读验证，验证失败则停止提交。该设置是账号级设置，会影响该账号后续图片、视频；不修改文档/PPT或肖像授权设置。

结果取回使用官方 `/creativity/resource/get_without_watermark`，只接收原视频编号对应的 `download_video` 且 `without_watermark=true` 的结果，保留原始签名地址。普通账号的 `video_gen_watermark_unpaid` 可能保留豆包品牌水印，任务记录明确显示“AI 明水印已去除，保留豆包品牌水印”；旧播放接口的动态 AI 水印版本仍拒绝。无需付费升级或重新生成。

已有带水印结果导致“待核对”的任务，可点击“重新获取”走此流程，复用原视频编号，不再次消耗生成次数。需退出旧桌面程序，启动独立目录 `release/v0.1.61/启动桌面版.command`；助手由新桌面程序自动部署。

实机验收：2026-09-15，v0.1.61 / 助手 0.13.3 使用既有“小猫发现一封信”任务点击“重新获取”，通过官方成品接口完成下载、素材导入和原分镜回填；任务显示“已完成 / AI 明水印已去除，保留豆包品牌水印”，已保存项目。未新增生成请求。

### 排队与助手反复重载修复（桌面 0.1.62 / 助手 0.13.3）

v0.1.61 的调度器遗留固定助手版本 0.13.2，导致已安装的 0.13.3 被反复要求更新，账号无法达到空闲接单状态。v0.1.62 改为从源码或发布目录的助手 manifest 读取版本；增加调度版本一致性回归，保留原队列和生成次数。前端及助手与 0.1.61 相同。

### 过期更新指令恢复（桌面 0.1.63 / 助手 0.13.4）

补齐浏览器端恢复：已有 `pendingExtensionUpdate` 每次先向当前桌面核对版本，当前运行版本已经满足要求时结束更新；不再因旧桌面留下的目标版本反复重载。结合 0.1.62 的 manifest 读取修复，恢复原排队任务。新增过期更新指令回归测试。
