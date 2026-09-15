# 中央账号服务（账号、管理、统计）

独立 Node.js / TypeScript 服务，四张 SQLite 表；不依赖桌面构建，不上传作品和素材。实际服务器配置见 [部署手册](../../docs/access-control-deployment.md)。

## 运行与验证

Node.js ≥24.14，部署固定为 24.21.0；使用 Node 内置 SQLite（Node 24 仍会提示实验 API）。无 npm 运行依赖、无编译产物。升级运行时先跑测试。

```sh
cd services/access-control
npm test
npm run init-admin
npm start
```

默认数据 `data/access.sqlite`，监听 `127.0.0.1:8793`。环境变量：`ACCESS_DB`、`ACCESS_PORT`、`ACCESS_TRUST_PROXY`（默认关闭，仅在本机 Nginx 覆盖 X-Real-IP 后设为 1）。生产经 HTTPS 访问；本机端口不对外开放。类型检查使用仓库根 `node_modules/.bin/tsc -p services/access-control/tsconfig.json`。

初始化只执行一次：交互模式隐藏输入密钥，或 `node src/init-generated.ts /受限目录/新密钥文件`，后者生成 admin 随机密钥，以 0600 权限独占创建文件。已有超管或文件时拒绝覆盖。不得在命令参数、URL、日志中放密钥。

## 已实现接口

| 方法与路径 | 说明 |
|---|---|
| GET /health | 数据库连通检查，无账号信息 |
| POST /auth/login | JSON `{account,key,client_type:"desktop"或"web"}`；返回 token、user、session_expires_at、server_time |
| GET /auth/me | Bearer token 在线校验当前身份、封禁、有效期 |
| POST /auth/logout | Bearer token 撤销会话；重复退出也成功 |
| POST /usage/events | 已授权账号批量上报完成事件，原子写入并去重 |
| GET /admin/overview | 普通会员今日/累计、七日趋势、授权状态、前五位会员明细 |
| GET / POST /admin/users | 超管查询会员 / 增加普通会员 |
| POST /admin/users/:id/authorization | 修改到期时间，携带 revision、reason、expires_at |
| POST /admin/users/:id/ban 或 /restore | 封禁 / 恢复，携带 revision、reason |
| GET /admin/users/:id/usage | 单用户今日与日期范围内历史 |
| GET /admin/audit-logs | 分页查询只读审计；snapshot 固定本次查询上界 |

中央只接受 Authorization Bearer，不读取浏览器 Cookie。桌面主进程保存 token，不直接暴露到 URL 或 localStorage。会话 12 小时；用户封禁撤销全部会话；到期在每次校验时判断。账号转小写并去首尾空格，密钥不修剪且区分大小写。

HTTP 错误：400 输入错误、401 错误凭据/未登录、403 到期/封禁/无权限、404 未开放路径、413 超大请求、415 内容类型不符、429 限流/摘要计算繁忙、503 服务故障。响应含 request_id；禁止缓存。登录每 IP 和账号各 10 次/分钟（计成功与失败），摘要最多并行 2 次，无无限等待队列；重启重置内存限流。

`AccessService` 提供超管校验、创建普通会员及调整期限/封禁/恢复的内部函数，已测试事务、revision 冲突和权限边界。第三阶段已开放管理 HTTP 接口与查询界面，详见仓库 `docs/access-control-admin.md`；没有 DELETE。第四阶段已实现 usage_events 真实完成事件接入；不从旧项目生成历史数据。源码和本地测试完成不代表已部署。

## 安全与维护边界

密钥使用随机盐 scrypt（N=131072,r=8,p=1），符合 [OWASP 给出的 scrypt 参数](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html)；只存 token SHA-256 摘要。采用 [Node 内置 SQLite/backup API](https://nodejs.org/docs/latest-v24.x/api/sqlite.html)，备份包含 WAL 中已提交记录。

管理员初始化、登录/退出、内部用户变更及已识别管理员的失败操作留审计；第三阶段后台查询和已认证后台请求的输入失败也留审计。变更与成功日志同一事务，日志失败则拒绝变更。数据库触发器禁止普通 SQL 删除用户或修改/删除日志；这不是对服务器 root 的防篡改承诺。

`npm run backup -- /新路径/backup.sqlite` 创建一致性备份并完整性检查，拒绝覆盖已有文件。恢复先停服务、保存当前 DB/WAL/SHM 整组文件，再安装备份并重新启动；详见部署手册。数据库、密钥、备份与媒体不进 Git 或安装包。

## 第四阶段事件合同

`POST /usage/events` 使用当前 Bearer 会话，JSON `{events:[...]}`，每批 1–10 条且请求不超过 8 KiB。成功返回 `{acknowledged:[事件ID],server_time:毫秒}`，确认包含相同内容重传；整批校验/入库原子完成。账号 ID 与事件角色从服务端会话读取，拒绝客户端额外身份或其他未知字段，到期/封禁/失效会话仍拒绝上报，客户端保留队列待重新授权。

每条事件必填 `event_id`、`operation_id`、`output_id`、`metric`、`video_kind`、`quantity`、`occurred_at`、`source`。前三项仅字母/数字/冒号/下划线/点/连字符，长度分别 1–240、1–100、1–100；quantity 为 1–100 整数；occurred_at 为非负毫秒整数。metric 支持 idea/story/script/asset/video_export，兼容独立 draft_export/kit_export（不计视频）。video_export 的 video_kind 必须 shot/final，其他指标必须空串。source 仅 project/ai/generation/upload/doubao/speech/video_export。

event_id 和 `(user_id,operation_id,output_id,metric,video_kind)` 双唯一；重复业务键内容相同也确认输入 ID，内容不同或跨账号占用同 event_id 返回 409 `USAGE_EVENT_CONFLICT`，整批不写入。管理员业务以 `business.<metric>.completed` 留审计，和事件同事务，重传不新增日志；不进入会员指标。

schema v2 在原四表增加 clock_status：normal/anomalous。早于账号创建或晚于服务端接收时间超过五分钟的事件保留并标异常，排除常规汇总；迁移同样标记已有明显异常记录。概览/详情返回 telemetry_connected=true、最后会员接收时间 last_received_at、最近正常活动 last_activity_at、全历史异常事件数 anomalous_event_count；概览 final_export_connected=false，表示最终成片采集尚未接入。详情 items 含 received_at/clock_status，日期按北京时间和 occurred_at 筛选，汇总只含正常会员事件。收到时间、最近活动及异常计数不受详情日期筛选影响。没有事件时接收/活动时间为 null。

升级前做数据库一致性备份。v2 可重启反复打开；旧 v1 服务不支持 v2，不能直接将旧程序切回运行升级后的数据库。需要回退时保留新数据库及 WAL/SHM，按部署手册停机恢复相应备份。
