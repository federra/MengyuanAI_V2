# 0.1.73 Chrome 查找修复发布

2026-09-17，用户授权构建 Mac/Windows 并发布更新渠道；本轮未要求 Git 提交或推送。

## 改动

- Windows 查找 Chrome 增加 ProgramW6432、环境变量名大小写兼容及 HKCU/HKLM 两种视图的 App Paths 注册信息。
- 豆包插件 → Helper 提供“选择 Chrome 程序”“恢复自动查找”。原生选择框返回完整路径，Windows需选chrome.exe，Mac选Google Chrome.app。只接受可读取文件，启动不通过shell执行。
- 路径保存在本机 userData/chrome-path.json，设置写盘后生效，启动时读取；失效路径明确提示重选。当前已打开的浏览器会话保留，新路径用于新会话。

## 构建与验证

- Windows x64安装包176216436字节；Mac arm64 ZIP219241387字节；Mac x64 ZIP229168477字节。校验表位于本地 `desktop/release/v0.1.73/checksums.json`。
- Windows模拟路径/注册表/手动路径持久化/失效恢复，Chrome插件加载与会话复用回归、软件更新测试通过；TypeScript检查和生产构建通过。
- 临时用户目录的真实Electron接口验证手动路径保存、取消保持原值、恢复自动查找通过。未运行真实豆包生成。
- 独立Apple Silicon .app实际启动成功，登录页正常、未认证项目API返回401。故事布局、Skill四格式和ZIP、Mac更新界面回归通过。
- 两种Mac均通过本地codesign严格校验，与Windows的142个业务文件相同，无工程外部软链接和用户SQLite数据库。Intel首次解压Electron发生临时软链接错误，重试完成。
- Windows安装/升级、Intel Mac运行尚未实机验收；Windows未签名，Mac为本地临时签名且未公证，沿用0.1.72的手动替换安装方式。

## 发布

复用 `/srv/ai-director-studio-updates/windows/` 与 `mac/`。版本文件先上传，SHA-512与大小核对后原子替换更新清单，保留0.1.72及更早版本。实际发布完成状态见开发交接最新记录。

发布已完成：三个安装包及Windows blockmap在服务器完成大小和SHA-512比对，Windows latest.yml/release.json、Mac release.json已切换0.1.73；公开HTTPS匿名Range请求三个包均返回206。旧版0.1.72包及清单备份保留，中央账号服务未改动。
