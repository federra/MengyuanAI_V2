# 0.1.72 双平台发布

2026-09-16，用户授权提交、合入 main、推送 GitHub，并发布 Mac/Windows 更新。功能说明见 `desktop/release-notes.md`；构建与发布方式见 `desktop/UPDATES.md`。

## 构建与验证

- Windows x64 NSIS：`desktop/release/v0.1.72/windows-installer/publish/MengyuanAI-Setup-0.1.72-x64.exe`，176214954字节。SHA-512与latest.yml及服务器上传文件一致。
- Apple Silicon Mac ZIP：`desktop/release/v0.1.72/mac-arm64/publish/MengyuanAI-0.1.72-arm64.zip`，含独立.app及安装说明。
- Intel Mac ZIP：`desktop/release/v0.1.72/mac-x64/publish/MengyuanAI-0.1.72-x64.zip`，含独立.app及安装说明。
- 两种Mac均通过codesign严格校验（临时本地签名，不是Apple Developer ID/公证）。安装后沿用原用户数据目录；替换应用前保存项目并退出旧版。0.1.71及以前Mac需从下载链接手动更新一次；0.1.72起设置中按架构下载Mac更新。
- Apple Silicon独立.app已用临时资料实际启动：登录页正常、未认证项目API返回401、渲染层无Node访问。隔离Electron界面验证故事左右分组、四种Skill下载、ZIP导入、Mac更新按钮按架构打开下载通过。
- 三个平台142个业务文件一致；Mac包无指向工程目录的外部软链接，无用户SQLite数据库。
- 类型检查、构建、导入/Skill/模型600秒/豆包水印与重试/软件更新/安全退出回归通过。测试没有调用真实收费模型。
- Intel Electron运行时下载曾中断，重试后与官方GitHub发布API摘要一致：SHA-256 `6e3278d96377085af532380e2b23a38cdcf4c58b4efb3f6ada2f251db95c9560`。
- Windows安装和升级、Intel Mac运行尚未实机验收；Windows未配置发布签名，Mac未公证。用户已授权本次发布，不把构建和模拟验证称为实机全通过。

## 发布路径

服务器目录 `/srv/ai-director-studio-updates/`，按平台分 `windows/` 与 `mac/`。仅上传包、校验元数据及清单，不包含源码目录、账号服务凭据或用户数据。先上传版本文件并比对SHA-512，然后原子切换更新清单；旧版文件保留。具体在线验证及Git记录见开发交接最新记录。

## 发布完成

- 功能提交 `cf66632` 已快进合并到 `main` 并推送 `origin/main`。安装包、临时运行目录与用户资料未入Git。
- 三个安装包均完成服务器SHA-512及字节数核对；Mac arm64为219239827字节，x64为229166904字节。
- Windows `latest.yml` 和 `release.json`、Mac `release.json` 已原子切换为0.1.72，公开HTTPS读取确认；三个包匿名Range请求均返回206。证书验证未关闭。
- Windows旧0.1.70包及清单备份保留；中央账号服务未改动。
- 下载：Windows `https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.72-x64.exe`；Apple Silicon `https://121.199.40.214/updates/mac/MengyuanAI-0.1.72-arm64.zip`；Intel `https://121.199.40.214/updates/mac/MengyuanAI-0.1.72-x64.zip`。
