# 第三阶段：管理员后台实施

后续状态：第四阶段统计采集及中央服务已完成，现行记录见 [统计实施](access-control-usage.md)。下文保留第三阶段验收时的事实，不作为当前“统计尚未接入”的依据。

更新：2026-09-15，北京时间。管理员后台源码、接口与隔离桌面联调已完成；中央服务已发布 `20260915-admin-01`。桌面安装版仍为 0.1.69，未发布新版本。统计采集留第四阶段，安装包与最终验收留第五阶段。

## 一、界面与操作

正式页面按 `prototypes/access-admin/` 已审阅 Demo 实现：系统设置下方的管理员入口，数据概览 / 用户管理 / 操作日志三页签，五项统计卡、七日趋势、会员状态、会员明细、授权弹窗与深浅主题。样式局限于后台，复用现有工作台和主题开关。没有把 Demo 的内存账号、切换角色或示例数字带入正式界面。

- 仅超级管理员看到入口；新增会员设置账号、密钥、备注、到期时间和原因。随机密钥由浏览器加密随机数生成，只在创建表单内显示；创建前保存，之后无法查询旧明文密钥。
- 调整授权、封禁、恢复均需填写原因并确认。封禁立即撤销会话；恢复不延期，调整到期时间不解封；修改携带 revision，冲突要求刷新重试。无删除入口或接口，数据库也拒绝删除用户。
- 用户列表支持账号/备注与状态筛选及分页。使用详情展示今日、历史累计和日期范围内记录；日期按北京时间，结束日包含当天。
- 操作日志只读，支持对象/操作者、操作类型、日期与分页。记录变更前后、原因、结果和请求 ID。分页以 SQLite 行号上界保持查询快照，重新查询获取新记录。查询本身也写审计；密钥、密钥摘要和 token 不返回页面、不写日志。
- 大盘只汇总 `role_at_event=member`，到期/封禁后的历史保留。视频总数细分 shot / final；草稿、剪辑包不计视频。**目前没有创作上报链路，因此页面明确说明统计尚未接入，正式库无事件时显示 0/空记录；不能把它解释为用户确实未创作。**第四阶段完成后去掉整体未接入提示，最终成片未接入时仍单独标明。

## 二、接口和源码

桌面路径：`components/admin-console.tsx → preload directorDesktop.admin → desktop/main.cjs → desktop/admin-bridge.cjs → 中央 HTTPS`。会话 token 仅在主进程。IPC 检查受信窗口/主框架、在线授权、当前绑定账号和超管角色；桥仅允许固定动作，拒绝任意地址。中央重复检查当前会话与超管角色，不能靠修改页面角色绕过。

| 桥动作 | 中央接口（基地址 /access） | 用途 |
|---|---|---|
| overview | GET /admin/overview | 今日、累计、七日趋势、授权状态及前五位会员明细 |
| users / create | GET / POST /admin/users | 用户查询 / 新增普通会员 |
| expiry | POST /admin/users/:id/authorization | 修改到期时间 |
| ban / restore | POST /admin/users/:id/ban 或 /restore | 封禁 / 恢复 |
| usage | GET /admin/users/:id/usage | 单用户今日及历史明细 |
| logs | GET /admin/audit-logs | 只读操作日志 |

查询参数：`q/status/action/from/to/page/pageSize`，仅各接口相关项生效；日志分页额外带上响应的 `snapshot`。默认每页 20，最大 100；严格校验日期、分页与输入长度。状态 active / expired / banned 互斥，封禁优先展示。HTTP JSON 请求最大 8 KiB，错误返回稳定错误码及请求 ID，响应禁止缓存。

中央 `src/admin.ts` 负责有索引的 SQLite 聚合、筛选和查询审计；`src/service.ts` 保持权限变更与成功审计同事务。通过身份验证后的业务失败记录审计，格式错误的后台 JSON 请求记录拒绝原因；未认证请求、传输层超限/中断不冒充已识别管理员操作。没有新增表、依赖、缓存或统计任务。

## 三、验证与部署

本轮验证：中央五组测试、本地管理员桥白名单测试、根和中央 TypeScript 检查、定向 lint、生产构建；真实 Electron 对接本地独立中央 HTTP 服务及临时 SQLite，覆盖登录、后台显示、新增会员、封禁/恢复、使用详情、日志脱敏、深浅主题。普通会员登录与门禁回归另外检查隐藏管理员入口、IPC 拒绝访问。测试不调用真实 AI/豆包，不在生产库创建不可删除的演示会员。

```sh
node --test services/access-control/test/*.test.ts desktop/test-admin-bridge.mjs
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc -p services/access-control/tsconfig.json
pnpm build
DIRECTOR_ACCESS_STAGE=desktop/test-results/access-stage3-build desktop/node_modules/.bin/electron desktop/test-admin-ui.mjs
DIRECTOR_ACCESS_STAGE=desktop/test-results/access-stage3-build desktop/node_modules/.bin/electron desktop/test-access-ui.mjs
```

Electron 测试前按第二阶段说明准备独立 runtime 副本；`test-admin-ui.mjs` 使用宿主 Node 启动测试中央服务，可通过 `DIRECTOR_NODE` 指定 Node 24.14+ 路径。临时 userData、数据库和截图放系统临时目录，生产登录没有测试开关。截图侧栏版本来自 Electron 测试宿主，不代表已发布桌面版本。

服务器：先上传独立 `releases/20260915-admin-01`、执行该机 Node 24.21.0 的五组回归、执行备份并核对 Result=success，再原子切换 current、重启 director-access。真实 HTTPS 验证 health、admin 登录/概览/用户/日志/退出成功，游客访问后台 401，原站根路径 401，updates/health.txt 200。生产会员数仍为 0，没有迁移表结构。旧 foundation-02 保留，部署细节和回退见 [运维手册](access-control-deployment.md)。

独立只读代码审查完成，未发现阻止本阶段交付的重要问题；审查另外运行管理员 HTTP、HTTP 输入与桥接白名单三项测试并通过。页面截图复核修正了日志日期筛选框受旧 CSS 撑宽的问题，查询条件以中文展示。
