# 第一阶段：中央账号服务基础

目标：落实 [精简方案](../../access-control-design.md) 的第一步，提供可独立运行、可测试和可部署的账号服务，不接入桌面、不开发后台页面或统计上报。

架构：独立 `services/access-control/`，Node.js 24.14+ / TypeScript 原生执行、内置 SQLite、HTTP 服务，仅监听回环地址，由既有 Nginx 代理 HTTPS。四张业务表；不引入框架、Redis或新的根项目依赖。内置 SQLite 在 Node 24 仍属实验 API，部署固定并验证 Node 小版本，升级先回归。

约束：保留现有未提交文档、用户数据、更新服务及原站 Basic Auth。独立分支开发；远程认证信息不进仓库。初期技术默认值不扩张为产品权限限制。

- [x] 1. 环境检查：检查本机运行时、现有 SSH 认证；取得远程权限后只读核实系统、端口、磁盘、Nginx与证书。
- [x] 2. 测试先行：`test/service.test.ts` 覆盖初始化唯一性、登录状态、会话撤销、超管权限、变更事务和日志脱敏；先运行见失败，再实现 `src/store.ts`、`src/service.ts`。
- [x] 3. HTTP：`src/http.ts`、`src/server.ts` 提供 health/login/me/logout，限制请求大小、登录速率和并发摘要计算；集成测试异常输入与真实 SQLite 持久化。
- [x] 4. 运维：`src/cli.ts` 从终端隐藏输入初始化超管；`src/backup.ts` 在线一致性备份及完整性检查；编写 systemd/Nginx 示例与恢复手册。独立临时库验证备份恢复。
- [x] 5. 验收部署：测试、类型检查与定向 lint；远程可用时部署独立测试入口并检查原站和 updates 未受影响。若缺认证，完成本地内容并明确远程待办。更新 AGENTS、设计状态及交接。

服务接口契约：`POST /auth/login {account,key,client_type}` 返回随机 token、公开用户状态和到期时间；`GET /auth/me`、`POST /auth/logout` 使用 `Authorization: Bearer <token>`。中央不发浏览器 Cookie，下一阶段由同源 Web/桌面桥保存 token。基础用户变更先提供内部服务函数并测试，第三阶段再开放管理 HTTP 接口。

验收：已部署 `20260915-foundation-02`，服务器 Node 24.21.0 四组测试通过；HTTPS 登录/退出和实际备份隔离恢复通过，原站与 updates 状态未变。详细事实见 [部署文档](../../access-control-deployment.md)。
