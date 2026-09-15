# 剪映草稿导出（桌面版 0.1.55）

入口：项目导出 → 导出到剪映草稿。目录设置：工作台菜单 → 系统设置 · 文件位置，或导出窗口的目录设置。

默认草稿根目录为 `%LOCALAPPDATA%/JianyingPro/User Data/Projects/com.lveditor.draft`。每次导出创建唯一命名的独立目录，写入 draft_content.json、draft_meta_info.json、Resources 素材、字幕 SRT 和 source-project.json 文字设定快照。快照保留原软件素材引用，不是可跨电脑恢复的完整项目备份。

## 实际读取和格式依据

2026-09-14 读取用户指定目录：现有两个剪映工程的内容和元信息文件为编码/加密文本，不能直接作为普通 JSON 解析。root_meta_info.json 草稿列表和 Timelines/project.json 时间线索引可读取。没有解密或改写现有工程。

新草稿模板来自 [pyJianYingDraft](https://github.com/GuanYixuan/pyJianYingDraft)，参考提交 `c3318066d964744e2bfc66f75c71745fe8cea52a`，Apache-2.0，模板及许可证在 jianying-templates。参考源码的时间单位为微秒，material_id 关联素材池和片段，source_timerange 表示素材裁切，target_timerange 表示时间轴位置；音视频和字幕分别建立轨道。

仅导出启用分镜。画面使用视频，缺少视频时使用分镜图片；支持已设比例、时长及视频裁切。字幕和配音按 dialogueCues 时间段对齐；有独立配音的镜头静音原视频。背景音乐按 20% 音量循环至项目结束。素材复制到新草稿 Resources，引用最终绝对路径。不会重新请求生成服务。

下载失败、素材缺失、类型错误、时长不可读或视频裁切后不足时长，均停止导出；失败工作目录保留 export-error.txt，不发布为完成草稿。导出不覆盖已有目录，也不直接改 root_meta_info.json。

## 文件位置

directory-settings.json 保存于桌面用户数据目录。剪映目录保存后立即生效；项目目录更换需要空目录，记录为下次启动迁移。在后端数据库启动前复制 D1/R2/cache 等文件并切换路径，原目录保留。相互包含的路径、同一实际路径的别名和非空目标会核对，迁移失败继续使用原目录并提示原因。Windows 加密密钥仍在原 userData/model-key.bin，备份时需一并保留用户数据目录及自定义项目目录。

## 验证记录与限制

- 类型检查、生产构建通过；桌面包 0.1.55 的目录 IPC、设置对话框和默认路径检查通过，测试进程正常退出。
- test-jianying.mjs：视频裁切、轨道时序、独立配音、字幕、循环 BGM、素材复制、重复导出保留旧草稿、异常素材拦截、目录设置与迁移通过。
- DIRECTOR_MIGRATION_TEST=1 node test-backend.mjs：真实 D1/R2 数据迁移后，项目、图片和加密模型配置重新读取通过；原目录保留。
- ffprobe 在源代码和打包后的程序依赖中均可读取真实素材尺寸和时长。
- 已生成 5 秒测试草稿 `AI导演草稿格式验证-20260914020418-1E1E16`（两段画面、配音、字幕和背景音乐）。剪映自动将其加入 root_meta_info.json，无需本工具改写列表。
- 本机剪映 11.3.0.14362 已启动，但 Windows 窗口捕获持续报 `SetIsBorderRequired failed: 不支持此接口 (0x80004002)`，无法通过工具验证编辑器中播放和字幕渲染。已请求用户核对测试草稿；当前不能声称剪映编辑器内完整验收通过。
