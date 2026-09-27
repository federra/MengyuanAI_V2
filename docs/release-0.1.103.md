# 0.1.103 双端发布（2026-09-27）

用户授权提交、推送、打包并上传更新服务器。功能提交 `48b1e0a` 已推送 `origin/main`；桌面版本以 `desktop/package.json` 为准。包含创意、故事、剧本、分镜及成品导出工作区的交互与布局调整，以及分镜生成、模型设置和视频按钮对齐修复。更新内容见 `desktop/release-notes.md`。

发布文件位于本地 `desktop/release/v0.1.103/` 和服务器 `/srv/ai-director-studio-updates/`。公开下载地址：

- Windows x64：<https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.103-x64.exe>，176,317,276 字节。
- Mac Apple Silicon：<https://121.199.40.214/updates/mac/MengyuanAI-0.1.103-arm64.zip>，219,263,568 字节。
- Mac Intel：<https://121.199.40.214/updates/mac/MengyuanAI-0.1.103-x64.zip>，229,222,275 字节。

先上传 Windows exe/blockmap、Mac 两个 ZIP 及各自架构清单，核对服务器大小与 SHA-512；旧清单备份为 `.before-0.1.103-20260927T023606Z`，再依次原子切换 Windows `latest.yml`、Windows `release.json`、Mac `release.json`。三个包公开 HTTPS Range 0–31 均返回 206，Content-Range 的总长度与本地一致；公开版本清单均为 0.1.103。旧包保留，未修改用户数据库、媒体或中央账号服务。

本地验证：创作、模型、视频上下文、豆包及软件更新测试，TypeScript、定向 lint、Web 构建和真实桌面后端回归均通过；两个 Mac ZIP 通过压缩包完整性检查，Mac 应用完成临时签名及严格校验。未执行付费模型调用。Windows 安装/旧版升级和 Intel Mac 尚无实机验收；Windows 安装包未配置代码签名，Mac 未经 Developer ID 公证。Mac 保存并退出旧版后手动替换；Windows 已安装的 NSIS 版可通过软件内更新。
