# 0.1.115 双端发布（2026-10-09）

用户授权将当前版本合入main、提交推送GitHub、打包上传更新服务器。当前改动已在main，远端基线b1e6cdd一致，无需额外分支合并。本版汇总项目重命名入口、简化流程导航、导入成功后跳转，以及删除项目回显和人物资产描述丢失修复。

状态：已发布。功能提交`b770472`已推送GitHub main；Windows x64 NSIS和Mac arm64/x64 ZIP已上传，公开双端渠道均0.1.115。三个包、Windows blockmap及五份清单共9个文件大小/SHA-512与本地一致；旧清单备份后原子替换，公开HTTPS清单及三个包Range206验证通过。安装目录选择与默认桌面快捷方式保留；旧包、运行窗口与用户数据保留。

发布审查补修冒号混合列表的角色描述误绑：有歧义的姓名/属性边界不再自动推断，保留待完善警告，不把“鞋子”等属性建成人物；明确括号列表、人物表和单一冒号描述仍保留。新增回归先复现再修复，资产专项16项通过，独立复核确认无阻断问题。82个Node回归脚本通过；其中13个本地服务测试最初被沙箱端口权限阻止，提升权限后均通过。补修后资产、分镜、修复链路回归及类型检查、定向lint、构建通过；实际Electron更新下载、SHA-512和代理回退测试通过，不执行真实安装。

删除与资产问题修复的是隔离环境可复现源码缺口，未取得反馈用户的原项目、剧本或模型响应，不能等同Windows现场复现。原文没有明确人物设定时不虚构外观；不额外调用付费模型。Windows安装升级及Intel Mac实机尚待验收，签名方式沿用现行包。

## 安装包与本机验证

- Windows x64：`MengyuanAI-Setup-0.1.115-x64.exe`，176,376,882字节；SHA-512为`oSJ8SUfhDcDWhtLxB+nLihfK92AWm1LNRlpXWUaeSpsDbxJ7NoXoY1fcGuuO1sxKl9RBK9hm4Kb5IYqJWQNi1Q==`。
- Mac Apple Silicon：`MengyuanAI-0.1.115-arm64.zip`，219,340,831字节；SHA-512为`zXT9PK2EymNYq3Uqb85vnGxCTa2TI39RIZ1/p0EPZPS4FElMiiCxcfEV1etxCHagAxSj+cVrWpk9vj7QR+decg==`。
- Mac Intel：`MengyuanAI-0.1.115-x64.zip`，229,299,447字节；SHA-512为`b5lyp8H6jmFe9HJveXMchrOXO8gSbsO0sTegG4mrlCY4Dr8TL7sCCPXFstGxP9kTlGWerw01MDUxM4PwcsfhxA==`。

三平台154个程序、编译runtime、插件、迁移及Skill资源逐字节匹配，扩展仍0.13.6；Mac ZIP完整性及严格ad-hoc签名通过。Windows更新地址、VC运行库及NSIS目录选择/默认桌面快捷方式配置保留，不混入用户数据、账号、Chrome配置或源码映射。最终Apple Silicon客户包的隔离Electron验证通过：清空项目后的旧草稿不恢复，三类文本导入跳转/保存及取消/失败保持原页正常；此前7项隔离桌面回归通过。

本机安装包目录为`desktop/release/v0.1.115/windows-installer/publish/`、`desktop/release/v0.1.115/mac-arm64/publish/`、`desktop/release/v0.1.115/mac-x64/publish/`。功能提交`b770472`已推送GitHub main；当前运行114预览、旧版本、快捷入口及用户资料保留。

## 公开下载与服务器验证

- [Windows x64安装包](https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.115-x64.exe)
- [Mac Apple Silicon应用包](https://121.199.40.214/updates/mac/MengyuanAI-0.1.115-arm64.zip)
- [Mac Intel应用包](https://121.199.40.214/updates/mac/MengyuanAI-0.1.115-x64.zip)

服务器先暂存并校验全部9文件，再备份旧清单并原子替换；备份后缀`.before-0.1.115-20261009T104352Z`。发布后再次核对全部9文件；匿名有效HTTPS返回双端`release.json`及Windows`latest.yml`均115，Mac两份artifact大小/SHA-512匹配，三个包Range下载均206且总大小一致。历史包保留；Windows安装升级、Intel Mac实机及反馈用户真实模型质量待复验，不把发布成功视作实机验收通过。
