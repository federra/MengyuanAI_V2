# Windows 更新代理故障修复（2026-10-08）

状态：最初仅源码修复，随后已纳入独立0.1.113本地预览，见[实施记录](model-budget-doubao-retrieval-2026-10-08.md)。未制作客户安装包、提交推送或上传。公开渠道仍为0.1.112，其安装包不包含本次修复；原运行0.1.112正式客户包保留。

## 原因与复现

用户反馈0.1.103更新至0.1.112时出现 `net::ERR_PROXY_CONNECTION_FAILED`。版本清单检查使用Node fetch，而Windows下载使用electron-updater的Electron网络会话；后者读取系统代理。失效代理可导致“发现新版正常、下载失败”，与跨版本更新无关。

本轮在独立Electron数据目录设置不可连接的本地代理，复现相同错误；原代码下载失败，修复代码成功下载本地测试文件并完成SHA-512校验。没有取得客户机器的代理配置或日志，不能断言其具体代理来源。公开0.1.112清单HTTPS 200、安装包Range 206及总大小176370641字节正常，未发现服务器文件缺失。

## 修复范围

`desktop/software-update.cjs`仅遇到明确代理连接错误时，将electron-updater专用会话改为直连、关闭旧连接并重试一次；不修改系统代理或其他页面的网络会话。重试重新核对同一个版本，仍通过原下载器执行完整性校验和安装退出保护。TLS、校验和、普通超时及HTTP错误不触发代理回退；第二次失败显示原因，不进入安装。

## 本轮验证

- `node desktop/test-software-update-proxy.mjs`：检查/下载阶段代理失败恢复、正常代理保留、并发合并、非代理失败不重试、直连失败及版本变化不安装，通过。
- `node desktop/test-software-update.mjs`：原版本判断、失败、取消关闭及安装交接回归，通过。
- `desktop/node_modules/.bin/electron desktop/test-software-update-proxy-network.mjs`：真实Electron/electron-updater网络会话复现、测试文件下载、SHA-512和默认会话代理保留，通过。测试不会执行真正安装程序或写入用户项目。
- 主进程语法、TypeScript及diff检查通过；新增测试文件lint通过。更新模块lint仍有与HEAD一致的3项历史诊断，未新增。独立审查无Critical/Important问题。

Windows安装升级实机尚未验收；本轮网络验证使用Mac上的共享Electron下载实现，不等同于Windows安装器验收。

## 旧版客户临时处理

旧版不能通过服务器清单直接获得新的下载逻辑。可先关闭失效系统代理并重启软件重试；或在浏览器中下载现行0.1.112安装包，保存退出软件后覆盖安装。手动安装112解决本次升级阻塞，但该包仍使用原更新逻辑，永久修复需后续发布包含本次源码的更高版本。

现行安装包：[Windows 0.1.112](https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.112-x64.exe)。

## 0.1.114正式交付

本记录上方为历史状态。用户授权后，本修复已纳入Windows 0.1.114客户包并上线，见[发布记录](release-0.1.114.md)。旧客户端若仍受失效代理阻碍，先关闭失效代理或浏览器下载[Windows 0.1.114](https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.114-x64.exe)，保存退出后覆盖安装；安装114后才获得后续更新直连回退。Windows安装升级实机仍待验收。
