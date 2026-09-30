# 0.1.104 双端发布（2026-09-30）

用户授权将三份适配 Skill 加入桌面 Skill 中心，并提交、推送、打包、发布。源码提交 `47c96bf` 已推送 `origin/main`；桌面版本号 `0.1.104`。三项按顺序为 `arcreel-剧本转分镜`、`arcreel-小说转剧本`、`影策-剧本转分镜`，分别用于分镜、剧本、分镜阶段。适配正文来自 `docs/skills/` 指定文档，构建快照与源文一致；安装包携带上游许可与署名。同期发布上一轮分镜提示词 @ 资产绑定、图片缩略图和生成状态显示修复。

下载地址：

- Windows x64：[安装包](https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.104-x64.exe)，176,352,884 字节。
- Mac Apple Silicon：[ZIP 应用包](https://121.199.40.214/updates/mac/MengyuanAI-0.1.104-arm64.zip)，219,308,357 字节。
- Mac Intel：[ZIP 应用包](https://121.199.40.214/updates/mac/MengyuanAI-0.1.104-x64.zip)，229,267,025 字节。

发布目录为 `/srv/ai-director-studio-updates/windows/` 与 `/srv/ai-director-studio-updates/mac/`；旧清单备份后缀 `.before-0.1.104-20260930T051202Z`。先上传四个版本化文件并验证远端大小与 SHA-512，再原子替换 Windows `latest.yml`、Windows `release.json` 和 Mac `release.json`。公开清单均为 0.1.104，三个下载包匿名 HTTPS Range 0–31 均返回 206，Content-Range 总大小与本地一致。旧包、用户数据和中央账号服务未改。

本地验证：三份正文/名称/阶段测试、分镜数据回归、TypeScript、定向 lint、Web 构建及软件更新测试通过；三个桌面 staging 内均有 Skill 构建内容和许可文件，Mac 两包完成 ZIP 完整性及严格签名检查。未调用付费模型做 Skill 质量验收；Windows 安装/旧版升级与 Intel Mac 尚无实机验收。Windows 未配置正式代码签名，Mac 未经 Developer ID 公证。Windows 已安装的 NSIS 版可通过软件内更新；Mac 保存项目并退出旧版后手动替换应用。
