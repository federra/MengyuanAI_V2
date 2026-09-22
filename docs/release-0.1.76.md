# Windows 0.1.76 发布记录

日期：2026-09-22。用户授权提交推送当前修改，再构建发布Windows更新。功能提交 `fcae0ef` 已推送 `origin/main`。本次仅Windows x64，Mac渠道维持0.1.75。

## 内容

分镜生成/导入/编辑应用统一校验；已知外部分镜Agent结构确定性映射并保留台词、提示词、资产、音色和来源元数据，未知结构最多AI转换一次再验证；细分模型转换响应错误。角色默认三视图及Skill；资产管理固定表头、修复清除引用、分离预览/应用/替换，原生图片目录支持选择历史图片。Mac分栏显示修正仅为此前本机视图设置，不宣称作为Windows代码修复发布。

## 安装包与渠道

- 文件：`MengyuanAI-Setup-0.1.76-x64.exe`，176228587字节；blockmap为185532字节。
- SHA-512（Base64）：`osUvaqolhbSCfPFRgZ+PYFfr09OCTsosLfwdLB6XJEJ439WLDfn6IrjWJlDlV01ZiqtQxjohqX2XFjnGtNsIQQ==`。
- 本机构建：`desktop/release/v0.1.76/windows-installer/publish/`。
- 服务器：`/srv/ai-director-studio-updates/windows/`。
- [Windows安装包](https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.76-x64.exe)。

安装包、blockmap及两份清单先上传暂存目录，服务器核对全部文件大小与SHA-512后，发布版本化文件，再依次原子替换latest.yml、release.json。旧清单备份为 `.backup-before-0.1.76-20260922T055403Z`，旧安装包保留。Mac渠道和用户数据未修改。

## 验证与边界

本轮核心、分镜确定性转换/AI兜底接口、角色Skill、图片目录与软件更新回归通过；类型检查、定向lint及构建通过。包内88个业务构建文件与本次dist逐文件一致，桌面桥接模块与源码一致；版本号及更新清单SHA-512一致。

服务器四文件大小/SHA-512通过；外部匿名HTTPS release.json/latest.yml与本地逐字节一致；安装包Range0–31返回206，总长度和文件头正确。Mac公开清单核对仍0.1.75。之前隔离Mac桌面已完成本轮资产/导入流程验收；本次无Windows实机，安装/升级实机验收仍待完成，沿用未配置代码签名的交付方式。未使用付费模型测试。
