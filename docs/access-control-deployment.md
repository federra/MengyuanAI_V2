# 中央账号服务：部署与后续开发交接

更新：2026-09-15，北京时间。范围：开发计划第一至四阶段。**账号、管理员和统计接口已部署；桌面门禁、后台及真实使用统计源码和隔离测试已完成，尚未交付新安装版。**统计见 [第四阶段实施](access-control-usage.md)。后台见 [第三阶段实施](access-control-admin.md)。本页记录可复用的实际部署信息，不存密码、私钥、登录密钥或会话 token。

## 一、服务器与目录

| 项目 | 本次核实值 |
|---|---|
| SSH | `121.199.40.214:22`，管理账号 `root`；认证凭据另行保管，不在仓库 |
| 系统 | Ubuntu 24.04.4 LTS，Linux x86_64；内存约 3.4 GiB，部署前磁盘可用约 362 GB |
| 现有环境 | Nginx 1.24；系统 Node 18.19.1 保留不变 |
| 独立运行时 | Node **24.21.0**，`/opt/director-access/runtimes/node-v24.21.0-linux-x64`；`/opt/director-access/node` 指向它 |
| 服务源码 | 仓库 `services/access-control/`；服务器 `/opt/director-access/releases/20260915-usage-01`；`/opt/director-access/current` 指向该版本 |
| 运行身份 | 系统用户 `director-access`，禁止交互登录；systemd 单实例，内存上限 512 MiB |
| 持久数据库 | `/var/lib/director-access/access.sqlite`，旁边可能有 `-wal`/`-shm`；目录 0700、DB 0600，属 director-access |
| 配置文件 | `/etc/director-access/service.env`，0640，root:director-access；无凭据 |
| HTTP | 仅 `127.0.0.1:8793`；无需对公网开放新端口 |
| HTTPS 基地址 | `https://121.199.40.214/access`；健康检查 `/access/health` |
| Nginx | 原站 `/etc/nginx/sites-available/mengyuanai`，启用目录为符号链接；新增 include `/etc/nginx/snippets/director-access.conf` |
| 超管 | 账号 `admin`；随机密钥仅在 `/root/director-access-secrets/admin-key`，0600，父目录 0700；数据库只存 scrypt 摘要 |
| 备份 | `/var/backups/director-access/`，0700；`director-access-backup.timer` 每日北京时间 03:30，最多随机延迟 120 秒，错过后补执行 |

旧版 foundation-01、foundation-02、admin-01 保留供对照。第四阶段已迁移至 schema v2，旧版 v1 程序不能直接启动当前数据库；常规回退优先准备兼容 v2 的修复版本，不能只切回旧程序或覆盖数据库。

复用原 HTTPS IP 证书 `/etc/letsencrypt/live/mengyuan-ip/fullchain.pem` 与既有续期机制。本次证书有效期至 2026-09-19 07:34:10 UTC，已有 `mengyuan-cert-renew.timer` 与 certbot 定时任务；此类短期证书依赖既有自动续期，后续运维应检查任务结果。没有创建域名。`/access/` 取消继承的 Basic Auth，改由本服务账号认证；原根路径、`/api/` 的 Basic Auth 和 `/updates/` 下载规则保持。不得以部署账号服务为由公开原业务 API。

Node 从官方 HTTPS 下载，归档 `node-v24.21.0-linux-x64.tar.xz` 的 SHA-256：`fd8e59d5a511510f6a298afb548f18c7d2b1be404d8b4a27d94fbe49f56cb2d6`，与官方 SHASUMS256.txt 核对，本机和服务器均验证。服务器直连 nodejs.org 本次超时，采用本机下载后经 SSH 上传。固定该版本运行，后续安全升级先测试；服务使用的 Node 内置 SQLite API 在该版本系列应按官方稳定性说明评估，不直接跟随系统 Node 升级。

## 二、常用操作与接口

SSH 登录后执行，所有路径均为服务器路径：

```sh
systemctl status director-access --no-pager
journalctl -u director-access -n 100 --no-pager
curl -fsS https://121.199.40.214/access/health
systemctl restart director-access
systemctl list-timers director-access-backup.timer --no-pager
systemctl start director-access-backup.service
journalctl -u director-access-backup.service -n 30 --no-pager
```

用户自行读取并妥善保存初始密钥：在 SSH 终端执行 `cat /root/director-access-secrets/admin-key`，不要粘贴到工单、技术文档、命令参数或 Git。服务运行时不需要该文件；后续初始化命令不会覆盖账号或旧密钥。当前未提供自助找回与重置页面。

接口：`POST /access/auth/login`，JSON `{account,key,client_type}`；`GET /access/auth/me`、`POST /access/auth/logout` 使用 `Authorization: Bearer <token>`。密钥通过 HTTPS JSON 传输，勿放 URL。桌面下一阶段通过主进程桥接调用。完整错误码、限流和内部函数见 [服务 README](../services/access-control/README.md)。当前 `/access/admin/*` 与 `/access/usage/*` 尚未开放。

配置：`ACCESS_DB=/var/lib/director-access/access.sqlite`、`ACCESS_PORT=8793`、`ACCESS_TRUST_PROXY=1`。信任代理仅因服务绑定回环，且 Nginx 用真实连接地址覆盖 `X-Real-IP`；后续更换代理需重新核对，不能直接信任公网来路头。

## 三、更新、备份与恢复

更新服务时：本地测试/类型检查 → 只打包 `src/`、`test/`、`deploy/`、package.json 与说明 → 上传到**全新版本目录** → 在服务器固定 Node 下跑 `node --test test/*.test.ts` → 手动备份 → 切换 current 符号链接并重启 → 验证账号接口、根路径 401、updates/health.txt 200。不得上传根 node_modules、桌面 runtime、媒体、数据库、密钥或整项目。Mac 打包使用 `COPYFILE_DISABLE=1 tar --no-xattrs ...` 避免扩展属性副本。

systemd 与 Nginx 样例位于 [deploy](../services/access-control/deploy/)。只在配置变更时安装对应文件，执行 `systemd-analyze verify` / `nginx -t` 后才 reload。首次 Nginx 原配置备份为 `/etc/nginx/sites-available/mengyuanai.before-access-20260915`；未来回滚需先比对，不能覆盖之后的无关配置变更。

备份使用 SQLite 在线 backup API，包含 WAL 中已提交数据，完成后做 integrity_check，拒绝覆盖已有备份。每日定时任务已启用，并已手动执行；最新实际备份已在临时目录恢复并核对账号、审计和完整性。**目前是同机备份，尚未配置异机/对象存储副本**；需有独立存储目标后增加复制。建议保留最近 30 天，当前不自动删除，后续按实际容量清理已确认可淘汰的备份。

恢复操作仅在需要时执行，不在正常验证中覆盖生产库：

1. 先验证选中备份的 `PRAGMA integrity_check`，在独立临时路径打开并验证账号/日志；不要直接试恢复到正式路径。
2. `systemctl stop director-access-backup.timer director-access.service`，等待正在执行的备份完成。把当前数据库和同名 `-wal`、`-shm` **整组移入新建保留目录**，不要删除、不把旧 WAL 留在恢复后的 DB 旁。
3. 将选中备份复制为 `/var/lib/director-access/access.sqlite`，恢复 director-access 所有者和 0600 权限；目录保持 0700。恢复文件不得来自正在写入的原始 DB 单文件拷贝。
4. 启动服务，验证 health、登录、身份、退出与日志，成功后重新启用备份 timer。恢复会回到备份时的账号状态，需要评估备份后封禁/延期记录；必要时受控撤销恢复出来的旧会话。保留恢复前文件以便退回。

## 四、本轮验证与下一步边界

- 本机 Node 26.7.0：四组真实测试通过，包括账号生命周期/期限与封禁独立、会话持久化和撤销、非超管拒绝、事务回滚、日志与 token 脱敏、HTTP 限流/异常输入、进程启动、随机超管初始化及文件权限、在线备份恢复；类型检查和定向 lint 通过。
- 服务器 Node 24.21.0：相同四组测试全通过，测试用临时独立数据库，未导入 Demo 用户。
- 已部署真实库只有 admin；四表齐全。HTTPS 登录 → me 授权成功 → logout → 旧 token 返回 401。公网健康检查成功，Nginx 校验成功，服务和定时器 active；原 updates/health.txt 为 200，原站根路径为 401。
- 尚未开发桌面登录、Web/IPC 门禁、工作区归属迁移、后台页面/管理 HTTP 接口、业务统计采集；当前安装的桌面版不会因服务上线自动获得权限控制。未构建新桌面版本、未发布安装包、未提交/推送 Git。

下一阶段从客户端连接 `https://121.199.40.214/access` 开始，先接登录与逐请求授权；不要把已有本机回环 Cookie 当作中央会员授权，也不要把 Demo 的公开密钥用于服务联调。

## 2026-09-15 第三阶段部署补记

当前 `current → releases/20260915-admin-01`，systemd active。上传前本地回归通过；服务器五组测试通过，部署前备份 Result=success / ExecMainStatus=0；切换后真实 HTTPS 管理员登录、三种后台查询、退出成功，访客后台401、原站根401、更新健康检查200。正式会员数为0，无演示会员写入。接口与后续统计接入点见 [第三阶段实施](access-control-admin.md)。

## 2026-09-15 第四阶段部署补记

当前 `current → releases/20260915-usage-01`，Node24.21.0，systemd active。该机7项测试通过；迁移前备份 `/var/backups/director-access/access-20260915T123112-701363926.sqlite`，备份服务Result=success / ExecMainStatus=0。启动后数据库user_version=2，integrity_check=ok，正式会员0、usage_events0，没有注入演示数据。

HTTPS验证：health、管理员登录/概览/退出成功，telemetry_connected=true且final_export_connected=false；已认证的空事件批次400、访客上报401；原站根401、updates/health.txt200。真正业务写入和重传测试在独立测试库完成，生产仅做只读与无效输入检查。

本次为usage_events增加clock_status列，仍为四表。不能用admin-01/foundation旧v1程序直接启动v2数据库。保留v2库和后续写入，优先部署兼容v2修复版本；若必须恢复旧备份，先按本手册恢复流程保全当前DB/WAL/SHM并评估备份之后的账号、授权和事件变化，不能静默丢弃新记录。第五阶段桌面发版与Windows文件导出实机验收尚未进行。

### 第五阶段备份复验（2026-09-15）

备份服务手动执行成功；`/var/backups/director-access/access-20260915T124811-045381990.sqlite` 在服务器受限临时目录 `/tmp/director-stage5-restore-saLyhY/restored.sqlite` 独立恢复，integrity_check=ok、user_version=2、四表完整。未替换生产库，仍为 `20260915-usage-01`。桌面0.1.70交付状态见 [交付记录](access-control-delivery.md)，安装包未上传更新服务器。
