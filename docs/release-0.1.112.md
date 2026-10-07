# 0.1.112 双端发布（2026-10-08）

用户授权将当前版本提交至main、推送GitHub、打包并上传更新服务器。当前原本就在main，远端基线12198df一致，没有另一条开发分支需要合并；功能提交`163af67`已推送。Windows x64及Mac arm64/x64公开渠道均为0.1.112。

## 本版内容

AI导演助手改为鼠标缩放的对话边栏，底部输入固定，快捷操作、回复、修改状态与撤销统一在边栏；不再选择Skill、弹修改预览或二次勾选。助手仅处理当前环节，选中文字可进入片段修改并继续局部对话，生成不锁主页面。视频/配音/导出阶段只回答当前状态，不生成虚假的媒体修改操作。详情见[实现记录](director-chat-2026-10-07.md)。

发布独立审查修复主页面撤销沿用旧逻辑的问题：主页面和边栏共用安全撤销，恢复台词角色/音色/情绪及配音引用，拒绝覆盖后续镜头修改；主页面撤销后恢复片段上下文以便续聊。旧lines与dialogue不一致且台词重复时禁用猜测选区，避免误改第一处。

## 安装包与发布验证

- [Windows x64](https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.112-x64.exe)：176,370,641字节；SHA-512为`cAZmJrL9HWJwu85018G+mPpBdb3oAUx1T7Cr2Rc+/DEtkkgbbjEu2YwO6EGa+7uufClSYirJM678W9Qa6sAtAw==`。
- [Mac Apple Silicon](https://121.199.40.214/updates/mac/MengyuanAI-0.1.112-arm64.zip)：219,333,139字节；SHA-512为`s5BDi5d9u/xSYrQUykpwVQEIFU7/mUd/ZrUf5hJzjePL4Tgq/tEQ0Pw96KvESCDRmsayi5Ov16pq7t0rY99W2w==`。
- [Mac Intel](https://121.199.40.214/updates/mac/MengyuanAI-0.1.112-x64.zip)：229,291,738字节；SHA-512为`fn4JfvARprJ80xNuTjk1rg8/r1oRSBQzOcFzfxG8r2WhHvPIAspz6YNMlLU99Bl9fUEG5HmsntWLbvhJ8GdR5A==`。

本机安装包分别位于`desktop/release/v0.1.112/windows-installer/publish/`、`desktop/release/v0.1.112/mac-arm64/publish/`、`desktop/release/v0.1.112/mac-x64/publish/`。三平台包内版本一致，92个业务runtime文件与最终dist逐字节核对，包含0004回收站迁移；使用共享白名单、独立生产依赖，无用户数据库、账号资料、Chrome配置或源码映射。Windows配置保留自选安装目录、默认桌面快捷方式、卸载保留数据及固定更新渠道。两份Mac ZIP完整性和严格ad-hoc签名检查通过。

三个包及Windows blockmap、五份清单共9个文件先上传独立暂存目录并验证大小/SHA-512，再备份旧清单并原子替换；发布后9个文件再次核对。服务器目录为`/srv/ai-director-studio-updates/windows/`和`/srv/ai-director-studio-updates/mac/`；旧清单备份后缀`.before-0.1.112-20261007T155804Z`（UTC时间）。匿名有效HTTPS返回双端release.json、Windows latest.yml均112，Mac两个artifact元数据与本地一致；三个包Range206总大小一致。保留历史包、授权服务及用户数据。

## 本轮测试与限制

60个基础回归脚本全部通过，审查修复后定向stage/API回归、类型检查、定向lint及业务构建再次通过，软件更新和退出保护测试通过。最终Mac包内业务runtime通过隔离Electron验收：鼠标扩大/缩小、对话、故事/格式化剧本/富文本/台词选区、边栏及主页面撤销后续聊、生成中页面切换、指定分镜行优化、1450/1024/760宽度与深浅主题；截图已检查。模型回复为确定性模拟，没有付费生成或改写真实项目。全仓历史lint诊断不在本轮清理范围，未声称全仓lint通过。

Windows安装/升级及Intel Mac实机仍未验收，真实模型创作质量需用户复验。Windows未配置正式代码签名，Mac为ad-hoc签名且未取得Developer ID公证。Windows NSIS用户可软件内更新；Mac保存退出后手动替换应用。运行中的112本机预览目录未覆盖，发布审查补修只进入新的客户安装包；本轮没有强制替换用户窗口或调整桌面快捷入口。
