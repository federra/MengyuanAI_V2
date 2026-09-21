# 0.1.75 双端发布记录

日期：2026-09-21。用户授权提交当前修复、推送GitHub，并构建发布Windows及Mac。

## 源码和内容

功能提交`cd35f41`已推送`origin/main`。包含连续保存版本同步、旧草稿安全恢复、生成前失败提示、分镜时间轴去重、图片尺寸全量修正，以及0.1.74模型布局/导航/记住登录等功能。恢复草稿与已保存版本不同时另建副本，原项目及任务保留。

## 文件

| 平台 | 文件 | 字节 |
| --- | --- | --- |
| Windows x64 | MengyuanAI-Setup-0.1.75-x64.exe | 176221750 |
| Mac Apple Silicon | MengyuanAI-0.1.75-arm64.zip | 219216122 |
| Mac Intel | MengyuanAI-0.1.75-x64.zip | 229174841 |

Windows blockmap为185479字节。本机目录为`desktop/release/v0.1.75/`，三个平台分别位于`windows-installer/`、`mac-arm64/`、`mac-x64/`的`publish/`目录。

服务器为`/srv/ai-director-studio-updates/windows/`及`mac/`，公开前缀为`https://121.199.40.214/updates/`。Windows使用`latest.yml`及`release.json`；Mac使用`release.json`及分架构`artifact-*.json`。Mac保存退出后手动替换应用；Windows支持软件内更新。保留旧发布包和更新清单备份，不修改用户数据。

## 验证

本轮项目保存/恢复、视频上下文/台词、图片尺寸矩阵、模型请求及软件更新测试通过；类型检查、lint、构建通过。三个包内共享业务runtime逐文件一致。Mac Apple Silicon独立包以隔离目录启动，通过登录门禁、未授权API401检查；最终包内代码通过隔离Electron旧草稿恢复、保存及原项目保留的完整验证。未调用付费生成。

首次构建遇到运行时下载超时和打包工具共用临时目录冲突，保留已有stage，以每平台独立临时目录续建。Electron三个架构运行时均按官方发布SHA256核对。Mac本地临时签名校验通过，尚无Developer ID及公证；Windows未配置代码签名。Windows与Intel实机安装/升级仍待验收，用户此前已授权无Windows实机时发布。

发布状态：已发布。三个安装包及Windows blockmap服务器SHA-512与本地一致；双端公开release.json均0.1.75，Windows latest.yml及Mac分架构清单与本地逐字节一致；三个包匿名HTTPS Range0–31均返回206及正确总长度。旧包保留，Windows0.1.74及Mac0.1.73清单已备份。发布记录在功能提交后单独提交同步GitHub。
