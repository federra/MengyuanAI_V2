# 第四阶段：真实使用统计实施

更新：2026-09-15，北京时间。桌面统计源码、中央接口、隔离联调已完成；中央版本 `20260915-usage-01`。桌面仍未发布新安装版，最终交付留第五阶段。统计从使用本轮客户端开始产生，不回填旧数据。

## 一、实际计数口径

| 指标 | 成功条件及去重方式 |
|---|---|
| 创意 | 新项目首次保存非空 brief 计1；先存空项目、之后填写也只计1；改写与重复保存不增加。旧工作区既有项目标记 ignored，桌面“导入项目JSON”明确携带导入标记，不计新创意。 |
| 故事 | `/api/ai` 非空且 finish_reason=stop；候选共用 parseStoryPlans 完整性校验，每个候选独立事件，3候选计3；无效JSON、截断及失败不计。正文故事每次完整输出计1。 |
| 剧本 | `/api/ai` 完整成功输出计1；编辑、应用、读取不额外计。这里只验证非空和模型结束状态，不承诺判断文学质量。 |
| 素材 | 图片、视频、音频非空内容写入R2并成功提交media记录后计1。上传、豆包、图片视频模型、配音统一入口；生成任务和豆包操作用稳定media_id，重复回调、查询不重复入库计数。缩略图/引用复用不产生事件。 |
| 导出视频 | 桌面新写出的分镜视频文件计1、video_kind=shot。已有文件再打开/定位、并发已有目标、取消/失败计0。最终成片尚未接入，草稿/剪辑包不当视频。 |

普通会员汇总仅包括中央记录的 member 身份和正常设备时间；到期/封禁不删除历史。超级管理员的完成事件留在使用事件表并写 `business.<metric>.completed` 语义审计，不进入会员大盘。上报不包含创作正文、媒体内容、密钥或本地文件路径。

## 二、本地持久化与上传

`业务成功 → 原账号 desktop_usage_events → 后端 IPC → 主进程中央会话 → /usage/events → 收到确认后标记 sent`。

- 仅增加一张桌面D1表 `desktop_usage_events`，由 `desktop/usage-outbox.cjs` 初始化，不添加队列服务。pending待传、sent已确认；waiting_idea记录新建空创意，ignored记录旧项目/导入/未成功发布；file_pending记录文件发布意图。已确认标识保留以去重。
- 项目更新和创意标记在同一D1 batch事务；媒体记录与事件也同事务。文本生成通过结构校验后先落事件，再返回完整结果。业务SQL失败不留下成功计数。
- 主进程向后端传入固定 ownerId/ownerRole；记录始终归本进程激活的账号。渲染层没有任意事件上报接口，主进程上传前再次检查中央会话和绑定账号；已提交任务失效后的内部收尾只能写回原账号。
- 后端每15秒尝试最多10条，网络失败、会话失效或确认丢失都保留原事件；重新获授权后补传，跨进程重启仍保留。中央去重成功后返回 `acknowledged`，仅确认ID标记已同步。后台显示最近接收时间和上报可能延迟，不能把离线设备视为实时完整数据。
- 双唯一：event_id，以及 user_id/operation_id/output_id/metric/video_kind。重复且内容一致只确认，不累计；同标识不同内容返回409并整批回滚。当前事件来源和字段长度已按中央约束验证；发生持续上报错误时保留记录排查，不自动丢弃。

视频发布采用同目录临时文件：完整下载并sync → 持久化file_pending → hard-link原子发布（不覆盖已有目标）→ 标记pending → 清理临时文件。进程在发布与记录之间退出时，下次启动核对临时文件与目标的设备号/inode/大小，只有属于该操作的完整文件才补记，并保留原操作时间。未发布或其他进程已有文件不计。需要导出目录支持硬链接；Mac实际测试已通过，Windows NTFS实机验证留第五阶段，不能把本机验证当作Windows验收。

## 三、中央接口与后台

POST `/access/usage/events`，JSON `{events:[...]}`，单批1～10条、现有8KiB上限。事件字段：event_id、operation_id、output_id、metric、video_kind、quantity、occurred_at、source；不接受客户端指定 user_id/role，身份由会话确定。成功返回 `{acknowledged:[...],server_time}`。

中央schema由v1迁至v2，仅为 usage_events 增加 clock_status，仍为四表。发生时间早于账号创建或晚于服务器5分钟以上标记 anomalous，保留原值但不进入普通汇总；正常值为normal。管理员可见异常条数，事件详情显示发生/接收时间和状态；指定日期范围按发生时间筛选，未来异常事件需选择对应日期才能查看。指标按北京时间归日，迟到上报归原发生日。这是使用观察，不是防作弊计费系统。

后台保留原Demo三页签、卡片、表格、弹窗和双主题。去掉全局“统计尚未接入”，改为最近接收、上报延迟、异常条数；用户列表显示最近已接收活动；只有 final 子项继续提示尚未接入。最初没有事件的账号显示0及空明细，不生成演示历史。

主要源码：`lib/usage-server.ts`、`app/api/projects/route.ts`、`app/api/ai/route.ts`、`app/api/media/route.ts`、`lib/generation-server.ts`、`lib/speech-server.ts`、`desktop/usage-outbox.cjs`、`desktop/backend.mjs`、`desktop/main.cjs`、`desktop/video-files.cjs`、`desktop/doubao-manager.cjs`、中央 `src/usage.ts` / `src/admin.ts` / `src/store.ts`。

## 四、验证、发布与接续

本轮验证：中央7项（含v1迁移）、本地outbox/文件恢复与导出、真实业务代码采集、Miniflare D1后端重启补传、Electron后台与会员门禁、类型检查、定向lint、生产构建。模拟模型响应验证成功/失败和多候选，未调用真实收费模型或豆包。测试预期1创意/3故事/1剧本/3素材/1分镜视频，事件明细与会员大盘一致；模拟中央已收到但ACK丢失后重传无重复。

```sh
node tests/usage-capture.mjs
node --test services/access-control/test/*.test.ts desktop/test-usage-outbox.mjs desktop/test-admin-bridge.mjs
node desktop/test-video-files.mjs
node desktop/test-usage-backend.mjs
DIRECTOR_ACCESS_STAGE=desktop/test-results/access-stage4-build desktop/node_modules/.bin/electron desktop/test-admin-ui.mjs
DIRECTOR_ACCESS_STAGE=desktop/test-results/access-stage4-build desktop/node_modules/.bin/electron desktop/test-access-ui.mjs
node_modules/.bin/tsc --noEmit
node_modules/.bin/tsc -p services/access-control/tsconfig.json
pnpm build
```

后端/Electron测试先准备与源码一致的隔离 runtime，方法沿用第二、三阶段说明。UI测试会启动独立中央SQLite进程，凭据全为测试数据；可用 DIRECTOR_NODE 指定Node24.14+。独立审查发现并修复桌面菜单导入缺标记的问题，随后通过真实菜单导入，读取本地ignored/0记录验证。

中央部署目录、备份和schema v2回退限制见 [运维手册](access-control-deployment.md)。旧已安装桌面不会自动获得统计功能。本分支未提交/推送，新桌面包、Windows实机与发布仍属第五阶段。
