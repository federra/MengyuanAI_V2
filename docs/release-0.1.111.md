# 0.1.111 双端发布与本机历史包清理（2026-10-06）

本轮在已有main上汇总一次提交，没有另一条待合并的开发分支。桌面版本为0.1.111，Windows和Mac公开渠道均已切换。包含此前0.1.105～0.1.110本地预览改动：资产提取一致性、AI阶段状态及思考输出预算、分镜展示与视频时长约束、资产界面精简、项目删除/30天回收站/恢复/确认清空、深色剧本及台词卡片高度与默认说话人。

发布前修正整项目重新生成仍追加旧分镜的问题：专用入口明确替换，普通生成仍追加；预览提示替换，确认应用后选中首镜头，撤销保留旧分镜。实际应用函数回归确认22秒旧段替换为10＋12秒，既有资产保留。

## 下载与校验

- [Windows x64](https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.111-x64.exe)：176,362,479字节，SHA-512为`eD3QmYyKWvxqTg7Y6DEo4nsskcmV8nPx5k/WZqFWENj7+sqoIW7U+Hn0/gjC9icxWRcVPzG95p8cBvqTAss6eQ==`。
- [Mac Apple Silicon](https://121.199.40.214/updates/mac/MengyuanAI-0.1.111-arm64.zip)：219,321,709字节，SHA-512为`m/0bTTp7Vq3oohZi2B8ofG42aOnVNYa8TRG0ogzsXSt5YGUUOeIhaRN1tRPcMG36SXxP/O1WXkHyK6PeuMcgxA==`。
- [Mac Intel](https://121.199.40.214/updates/mac/MengyuanAI-0.1.111-x64.zip)：229,280,317字节，SHA-512为`OCFO+AgaLMcm5brqbnY/cd/KisIIxzDYL/0C6IYTvFxviJvyAf43K4KfZc+Ktp5IaElaaeVFdJNwG3cBq9QOCA==`。

三个安装包及Windows blockmap先上传并核对服务器大小和SHA-512，再备份旧清单并原子替换Windows latest.yml/release.json与Mac release.json，Mac两份artifact元数据同步更新。发布目录为`/srv/ai-director-studio-updates/windows/`与`/srv/ai-director-studio-updates/mac/`；备份后缀`.before-0.1.111-20261005T160708Z`。匿名有效HTTPS再次确认双端版本0.1.111及三个包Range返回206，Content-Range总大小与本地一致。服务器历史包、中央授权服务及用户数据保留。

## 本轮验证及限制

58个回归脚本全部通过，类型检查和Web业务构建通过。新增/业务文件定向lint通过；全仓lint仍有历史诊断，改动涉及的原CommonJS管理器和伪浏览器API诊断与HEAD基线一致，未声称全仓lint通过。软件更新协议及豆包管理器隔离回归通过。旧测试同步了明确分组、usage依赖、JSON模块、项目表列名及模型超时导出，修正登录控件初始化等待，未放宽产品授权或数据校验。

最终0.1.111编译runtime在隔离Electron中通过18回收卡片的区域滚动/取消/恢复/清空/重载、七条台词固定高度和默认说话人、深色正文、三种宽度分镜可见性；台词/删除恢复使用Mac安装包内的真实runtime。三平台包内版本、迁移0004及新替换提示均一致，未包含用户数据库、账号资料、Chrome配置或源码映射文件。两份Mac ZIP完整性及严格签名检查通过。三平台打包各用独立TMPDIR，避免packager初始化删除共享临时目录。

未调用真实付费模型；Windows安装/旧版升级及Intel Mac尚无实机验收。Windows未配置正式代码签名，Mac为ad-hoc签名、未取得Developer ID公证。Windows NSIS版可在软件内更新；Mac需保存项目、退出旧版后手动替换应用。

## 本机清理

按用户本次明确授权删除8个本机历史版本生成目录：v0.1.69、v0.1.103～v0.1.109，共9,476个文件/链接，逻辑文件大小3,910,811,860字节（约3.91GB）。删除前确认均为Git忽略的程序生成物、不含用户数据库/账号资料、没有运行进程引用；源码、研究提示词、依赖及服务器历史包保留。

保留最新`desktop/release/v0.1.111/`、仍在运行的`desktop/release/v0.1.110/`及VC运行库前置资源。历史交接文档中0.1.109及更早本机release路径已不可用，保留历史记录但不能视为可启动入口。本轮没有强制退出用户的0.1.110窗口；源码与公开渠道更新不等于当前窗口自动切换到0.1.111。
