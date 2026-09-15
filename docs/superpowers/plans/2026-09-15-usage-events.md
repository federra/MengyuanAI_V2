# 第四阶段使用统计 Implementation Plan

**Goal:** 五项业务完成事件在原账号可靠留存、去重上传，并可在后台核对。
**Architecture:** 中央沿用四表；桌面只增加 desktop_usage_events 本地表，兼作待上报队列、创意已处理标记和文件发布操作记录。成功数据库写入与事件用 D1 batch 同事务；主进程保管会话，后端按原账号批量请求主进程上传。没有渲染层任意事件上报入口。
**Tech Stack:** 现有 TypeScript / Workers D1 / Electron Node / 中央 SQLite，无新依赖。
**Spec:** ../../access-control-design.md 第四节及用户本轮批准。

## 约束

保留当前分支未提交代码。事件不含正文/素材/密钥；不回填旧数据。封禁/到期只允许已提交任务收尾，待上报保留，重新获授权后再同步。普通会员大盘排除超级管理员，最终成片暂未接入，保持 Demo 布局。桌面发布留第五阶段，不擅自提交/推送。

## 执行任务

- [x] 中央：先测试 POST /usage/events 认证、重复、冲突、跨日、批次事务和超管排除；实现批量接收、异常时间标记与管理员业务完成审计。响应 acknowledged 为成功提交的 event_id 集合。更新概览最近接收时间、最近活动与接入状态。
- [x] 本地：新增 `desktop/usage-outbox.cjs` 初始化一张本地表、pending/sent/file_pending/ignored 状态、每批10条、失败保留、确认后标记。后端与主进程使用既有IPC，身份固定为启动时 ownerId/ownerRole；验证断网、确认丢失重传、重启及账号隔离。
- [x] 埋点：`lib/usage-server.ts` 提供事件语句和统一媒体入库；projects batch仅新项目首次非空brief，已存在项目不追溯；ai共用parseStoryPlans并在非截断完整结果后计数；所有media写入口统一；生成任务使用稳定产物ID以避免回调重复入库。
- [x] 导出：`desktop/video-files.cjs` 返回 `{filename,created}`；写完临时文件后记录发布意图，成功发布后将事件置pending，启动恢复核对完整文件；已有文件/并发重复打开不计，失败不计。临时文件与目标在同目录，保留用户文件。
- [x] UI与验收：保留现有后台样式，只改接入状态、最近活动/接收时间和异常时间提示；独立后端/中央联调核对五指标与大盘、模拟失败/重传/多候选；构建、双主题页面测试及独立代码审查。通过后备份并部署中央新目录，同步AGENTS/交接/实施文档。

关键接口：本地 SQL 事件列 `event_id,user_id,role_at_event,operation_id,output_id,metric,video_kind,quantity,occurred_at,source,state,details`；中央提交仅白名单 event_id/operation_id/output_id/metric/video_kind/quantity/occurred_at/source，服务端决定身份。事件ID用稳定标识构造，单操作多产物各自独立output_id；文件导出使用独立UUID操作ID。

完成记录：20260915-usage-01 已部署；中央7项回归、真实业务计数/中央对账、Miniflare重启补传、Electron后台及实际菜单导入验证通过。源代码未提交/推送，桌面未发版。详见 ../../access-control-usage.md。
