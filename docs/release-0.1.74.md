# 0.1.74 Windows发布记录

日期：2026-09-21（Asia/Shanghai）。用户授权当前修改提交并推送GitHub，仅构建并发布Windows安装包。

## 源码与范围

功能提交：`c58dff8`，已推送`origin/main`（federra/MengyuanAI_V2）。发布记录随后单独提交，最新提交以Git记录为准。安装包、依赖、用户数据及凭据未入Git。

包含模型分类页签与展开配置、图标折叠导航及悬停名称、系统设置扳手图标、双行微型标语、分镜居中固定表头、系统加密记住账号/密钥，并包含0.1.73 Chrome自动查找及Helper手动选择路径修复。详细实现见 [UI与登录优化](layout-login-improvements-2026-09-21.md)。

## 安装包及渠道

- Windows x64 NSIS：`desktop/release/v0.1.74/windows-installer/publish/MengyuanAI-Setup-0.1.74-x64.exe`，176219448字节；blockmap为185432字节。
- 公开下载：https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.74-x64.exe
- 服务器目录：`/srv/ai-director-studio-updates/windows/`。先上传安装包/blockmap并验证，再原子切换`latest.yml`、`release.json`，二者均为0.1.74。旧安装包和0.1.73清单备份保留。
- 安装包SHA-512：`33a128f6c126dddea696b1f562647f30b8df247d7b4c44961c6dad9a2a123c4a80986d8dc2c7109c69f3e0cb819b0b9eea013d15ad89d1e21a767256450bac89`。
- 本轮没有构建或发布Mac。公开Mac渠道经复核仍0.1.73，当前Mac预览进程未替换。

## 验证与边界

本轮通过：`pnpm build`、`pnpm exec tsc --noEmit`、`git diff --check`；Chrome查找/启动、软件更新、加密凭据持久化测试；在现有同源码Mac隔离stage上复跑Electron UI测试，覆盖记住/清除登录、导航折叠及名称提示、模型切换保留编辑、表头固定和横向同步。

Windows打包成功，核心主进程模块与源码一致，包含`remembered-login.cjs`，扫描未发现用户数据库或凭据文件。Electron44.3.0 Windows运行时按官方发布API SHA256核对。安装包及blockmap的服务器SHA-512与本地一致，公开HTTPS清单与本地逐字节一致；匿名Range0–31返回206，内容与安装包前32字节一致。

用户暂无Windows实机，真实安装、升级、Windows系统凭据加密与页面交互仍待验收；上述Mac测试和跨平台构建不代替Windows实机。安装包未配置代码签名证书。此前Windows输入框无键盘输入的反馈尚无实机复现，不宣称本版已修复该问题。中央授权服务本轮未变更。
