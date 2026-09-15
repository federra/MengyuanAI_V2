# 桌面软件更新

## 用户入口与支持范围

系统设置下方的“软件更新”展示当前版本、可用版本、更新内容，以及“检查更新”“下载并安装”。没有新版本显示“当前已是最新版。”；服务器未发布清单（404）时显示“更新服务尚未发布版本”，网络失败不冒充已是最新版。

Windows 使用 electron-builder NSIS 安装版 + electron-updater。源码启动版和旧便携包只能检查；旧用户需要先手动安装一次带更新组件的 NSIS 安装版。Mac 按本次需求仅查询 Windows 发布版本，禁用安装按钮，不下载或执行 Windows 程序。

下载由主进程执行并校验 SHA-512。下载成功后经过关闭窗口保护：未保存编辑或运行中的操作会触发原保存提示，豆包活动任务会单独提示。用户取消关闭后保留下载，下次点击继续安装。窗口允许退出后，先停止插件/后端，再调用 `quitAndInstall(true, true)`，安装后重新打开。更新不更改应用 userData 路径，不包含用户数据库、媒体、账号或密钥。

## 固定服务地址

- `https://121.199.40.214/updates/windows/release.json`：供界面读取版本及纯文本更新说明。
- 同目录 `latest.yml`、版本化 `.exe`、`.exe.blockmap`：供 electron-updater 获取安装包和完整性校验值。
- 服务器实际目录：`/srv/ai-director-studio-updates/windows/`。不使用网站登录密码或服务器管理凭据。
- 主进程不接受渲染层传入下载地址、命令或文件路径。

清单示例（实际文件由构建脚本生成，勿只发布示例）：

```json
{"version":"0.1.69","platform":"win32","releaseNotes":"更新点一\n更新点二","publishedAt":"2026-09-15T00:00:00.000Z"}
```

## 构建

1. 修改 `desktop/package.json` 的 version 和 `desktop/release-notes.md`，完成测试与根目录 `pnpm build`。
2. 安装 `desktop` 依赖。固定使用 electron-updater 6.8.9、electron-builder 26.15.3；`electron-winstaller` 为未使用的 Squirrel 目标，禁用其安装脚本，实际目标为 NSIS。
3. 准备官方 Microsoft `VC_redist.x64.exe`，通过 `VC_REDIST_PATH` 指定路径。仅首次缺少运行库时显示官方安装程序，不静默接受条款。
4. 执行 `node desktop/package-windows.mjs`。可设置 `ELECTRON_ZIP_DIR` 指向已下载的官方 Electron Windows x64 ZIP 所在目录。
5. 构建脚本使用源码白名单、最新 dist 和 Windows 专用生产依赖；剔除其他系统 ffprobe、source map、缓存、媒体和生成的插件 ZIP。输出为 `desktop/release/v版本/windows-installer/publish/`，默认不上传。

重复构建需另行保留/移开该版本的 `windows-installer` 目录，脚本不会覆盖它。应用名称、appId、安装范围及 userData 路径保持稳定。签名证书未配置时构建为未签名安装包；当前依靠有效 HTTPS 和 SHA-512 校验，正式签名发布后需同步配置 publisherName，不能绕过签名验证。

## 发布顺序

1. 在 Windows 实机完成首次安装及旧安装版到新版的更新演练，验证保存提示、下载中断、安装失败和项目数据保留。
2. 上传版本化 `.exe` 和 `.exe.blockmap` 到独立更新目录，校验上传文件大小及 SHA-512。
3. 对 `latest.yml` 与 `release.json` 分别以临时文件上传，再原子重命名替换；先替换 `latest.yml`，最后替换 `release.json`。两者版本必须一致。短暂不一致时客户端提示重新检查，不安装其他版本。
4. 从外部验证 HTTPS、文件校验值和 Range 下载。保留之前版本的安装包；不要通过降低清单版本回滚，修复应发布更高版本。

当前实现不自动向服务器发布。没有真实安装包时不要发布虚假版本清单。更新目录关闭目录列表是预期行为，直接访问目录会返回 403。

## 验证

- `node desktop/test-software-update.mjs`：版本比较、无更新/未发布/网络错误、校验失败不退出、取消关闭后复用下载、安装交接。
- `node desktop/test-shutdown.mjs`：服务退出与任务记录保存。
- Electron 运行 `desktop/test-software-update-ui.mjs`：临时数据库、模拟更新源与安装器，检查完整 UI 状态及深浅主题。测试不执行真正的 Windows 安装。

相关实现：`software-update.cjs`（主进程状态与校验）、`main.cjs`（IPC/退出交接）、`preload.cjs`（受限接口）、`components/software-update.tsx`（界面）、`build/windows-config.cjs`（NSIS 配置）。

## 0.1.70 发布记录（2026-09-15）

用户明确要求在暂无Windows PC的条件下发布，作为本次先实机验收规则的例外。0.1.70安装包及两份更新清单已发布到上述固定渠道，大小176,204,097字节，SHA-512与清单一致，匿名HTTPS Range返回206；未签名，Windows安装与升级实机验收仍待完成。后续发布继续遵守上述默认顺序。
