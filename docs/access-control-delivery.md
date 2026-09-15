# 第五阶段交付：0.1.70

最新状态：Windows 0.1.70已按用户明确授权公开发布，Windows实机验收仍待完成；详情见文末。以下为发布前的阶段记录。

2026-09-15：Mac 可开始用户验收；Windows 安装包已构建，用户确认目前没有 Windows PC，先按计划打包。Windows 实机与在线更新发布仍待完成，不能将本阶段整体标记为全部验收通过。

## 一、产物与启动

- Mac 本机入口：`desktop/release/v0.1.70/mac/启动桌面版.command`；桌面新增同名版本快捷入口 `AI短片导演-0.1.70.command`。先保存项目、正常退出旧版再打开新版。旧0.1.69目录和用户资料保留，没有强制结束旧进程。
- Windows x64：`desktop/release/v0.1.70/windows-installer/publish/MengyuanAI-Setup-0.1.70-x64.exe`，176,204,097字节。仅本地生成，未上传更新服务器，未配置代码签名。
- Mac 沿用本机源码启动方式，依赖本工程 `desktop/node_modules`；不是可复制给其他 Mac 的独立 `.app` 安装包。Windows 使用独立 NSIS 安装包。两端业务功能一致，不自动同步本地项目/媒体。
- 两端共享 `desktop/build/stage-runtime.mjs` 文件白名单及同一份 dist。142个业务、页面、插件、迁移及资源文件逐字节一致，校验表在 `desktop/release/v0.1.70/BUSINESS-SHA256SUMS.txt`。
- 安装包 SHA-512（base64）：`p3Vx3eNr8fB6AFsSUrh5z2L7ovakII8XiK7VcqXRrlOSRPWMs8An3W2//WV0QMmwvW6jVtF0n09h9EYcH4IjOA==`，与 latest.yml 一致。publish目录只有exe、blockmap、latest.yml和release.json；本地生成清单不代表服务器已发布。

## 二、Mac 用户验收

1. 退出旧版、启动0.1.70：只显示账号＋密钥登录。使用服务器初始化的 `admin`，密钥查看方式见[部署手册](access-control-deployment.md)，文档及包内不保存凭据。
2. 登录后确认右下/侧栏版本0.1.70，切换深浅主题；“系统设置”下方可进入管理员后台。新增测试会员、设期限、封禁/恢复、查看操作日志；这些是真实中央管理操作，会留记录且账号不可删除。
3. 会员需退出软件后重新打开并登录，确认全部创作功能可用、管理员入口隐藏。单个进程固定账号，切换账号需重启。
4. 首次登录按提示决定是否认领旧资料；认领复制到该账号目录，原资料保留。核对项目、素材、模型配置。不要将超管创建的创作量期待为普通会员大盘统计。
5. 会员实际成功生成/上传与导出后检查统计；失败、重复回调不重复加总。分镜视频成功写盘才计数；最终成片显示尚未接入，剪映草稿不计视频。真实模型操作按用户自主验收执行，本轮自动测试未调用收费生成。

## 三、本轮验证及范围

- `pnpm build`、根TypeScript检查、打包脚本语法检查、`git diff --check`通过。
- 使用正式Mac目录运行隔离Electron后台联调：真实本地中央HTTP、管理员创建/封禁/恢复、日志/统计、双主题及导入忽略统计通过；隔离会员登录、业务HTTP/IPC门禁、封禁/离线恢复通过。测试中央账号和数据均为临时夹具，不影响生产账号。
- 正式目录 `--smoke-test` 的独立数据启动日志显示 `Version=0.1.70`，登录页正常，未认证项目API返回401，正常关闭。登录测试中的预期UNAUTHENTICATED日志是门禁断言，不是测试失败。
- 账号工作区认领/原资料保留/隔离、视频文件安全写入/重复/中断、更新器及关闭回归通过。测试不是 Windows 安装器实际执行。
- 中央备份服务本轮 Result=success/ExecMainStatus=0；最新 `/var/backups/director-access/access-20260915T124811-045381990.sqlite` 复制到受限临时目录后完整性ok、schema v2、四表可读。生产数据库未替换，仍只有1个超管、0条使用事件。备份仍在同机。
- 独立交付审查未发现重要打包问题：Windows专用workerd/sharp/ffprobe文件存在，业务资源与Mac一致。

## 四、后续发布与复现

根目录先 `pnpm build`；Mac执行 `node desktop/package-mac.mjs`。Windows按[更新发布说明](../desktop/UPDATES.md)设置官方VC_REDIST_PATH和ELECTRON_ZIP_DIR后执行 `node desktop/package-windows.mjs`。两脚本拒绝覆盖已有目标目录；下次交付递增版本，不删除旧目录。Mac是本机交付，链接的依赖需保留。

Windows取得实机后验收：首次安装、旧NSIS升级、便携版首次转安装版、资料认领与配置保留、登录与后台、NTFS分镜导出及重试去重、下载中断/安装失败恢复。通过后再按 UPDATES.md 上传版本文件及原子替换更新清单。当前未提交/推送Git、未上传安装包或改写在线更新清单。

## 2026-09-15：0.1.70 公开发布

用户明确要求合入main、提交推送GitHub并发布Windows，授权在暂无Windows实机条件下发布。本次保留“Windows安装/升级尚未实机验收、安装包未签名”的验证边界。已向 `/srv/ai-director-studio-updates/windows/` 上传安装包及blockmap，核对大小/SHA-512后依次原子发布latest.yml、release.json，两份清单版本0.1.70；HTTPS匿名Range下载返回206。下载地址：<https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.70-x64.exe>。中央账号服务保持原部署，Mac本机入口保持0.1.70，mac服务器目录未发布独立Mac安装包。源码以本次main提交为准，安装包、资料与凭据未入Git。
