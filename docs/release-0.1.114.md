# 0.1.114 双端发布（2026-10-08）

用户授权将当前版本合并至main、提交推送GitHub、打包上传更新服务器。当前改动已在main，远端基线d38998e一致，无需额外分支合并。本版继承112，汇总113/114本地预览：文本模型可配置输出预算（默认不限）、豆包原任务重新获取、紧凑页面及账号按钮对齐、Windows更新代理失败直连回退。

独立发布审查发现并补修旧豆包页插件脚本升级后失效的问题：已知视频编号改用独立播放页取回原结果，保留原对话和草稿，不刷新或重新生成；后续轮询复用播放页，限制失效页恢复次数。新增隔离回归覆盖旧页恢复，先复现失败再验证通过。

状态：已发布。功能提交`901e071`已推送GitHub main，Windows与Mac公开更新渠道均为0.1.114。已通过80项Node基础/豆包/更新/退出回归、3项Electron主题及扩展DOM回归，以及真实Electron更新下载与SHA-512验证；类型检查、业务构建、定向TypeScript/新增测试lint和语法/diff检查通过。最终Mac客户包的预算配置及豆包重取/对齐UI隔离Electron验收通过，1450/1024/760窗口与深浅主题截图已检查。本次没有调用真实模型或豆包生成；CommonJS/扩展全文件仍有历史lint诊断，不声称全仓lint通过。

本轮首次并行打包触发electron-packager共用临时目录清理冲突（ENOENT）；保留失败Windows目录后单独重建成功。后续不同平台的打包应顺序执行，或明确配置各自临时根目录，不能假定默认临时目录相互独立。

模型及重取实现见[实施记录](model-budget-doubao-retrieval-2026-10-08.md)，更新修复见[排查记录](software-update-proxy-2026-10-08.md)。软件“不限制”表示不主动发送输出上限，模型或中转站仍可限制。旧版失效代理仍可能阻止本次自动更新，可通过浏览器下载新版，保存退出后覆盖安装；新版才能获得直连回退逻辑。

运行中的114本地预览、旧包及用户数据保留，不强制退出或覆盖。Windows安装升级和Intel Mac实机尚未验收；Windows未配置正式代码签名，Mac使用ad-hoc签名、未公证。按用户明确要求发布，测试结果不冒充Windows实机验收。

## 安装包与发布验证

- [Windows x64](https://121.199.40.214/updates/windows/MengyuanAI-Setup-0.1.114-x64.exe)：176,374,690字节；SHA-512为`L0szHsDKjRh5ZgdrTWTNVLTNZwDSDwluPwYrf6krNfNvJdBI4i9TvECW18qU2covghrMKjeWjbVD97kcv6KhmA==`。
- [Mac Apple Silicon](https://121.199.40.214/updates/mac/MengyuanAI-0.1.114-arm64.zip)：219,338,226字节；SHA-512为`XywzYpSWrEpQx1b+IqiTyES++BVWu9vlC9rWrmcOWkgURS+g9g2O3i/0NWxTla7ZpBA8hBxDR+MGButbZf1vBQ==`。
- [Mac Intel](https://121.199.40.214/updates/mac/MengyuanAI-0.1.114-x64.zip)：229,296,842字节；SHA-512为`UdzimLnYW/XpJ9B+5rkKwYfLYuzG8SL0yrBBbMupNbpibMRXy5Fu6VtFX6gt/MqyztCB37S6/NpHWBPga76Cfw==`。

三个包、Windows blockmap及五份清单共9个文件先上传独立暂存目录并核对大小和SHA-512，再备份旧清单并原子替换，发布后9文件再次核对。旧清单备份后缀`.before-0.1.114-20261008T050756Z`，历史安装包保留。匿名有效HTTPS返回双端release.json及Windows latest.yml均114，Mac两份artifact大小与SHA-512匹配；三个安装包Range206及总大小一致。

本机客户包目录为`desktop/release/v0.1.114/windows-installer/publish/`、`desktop/release/v0.1.114/mac-arm64/publish/`、`desktop/release/v0.1.114/mac-x64/publish/`。三平台154个程序、编译runtime、插件、迁移和Skill资源逐字节匹配，扩展0.13.6；两份ZIP完整性及Mac严格ad-hoc签名通过，Windows更新地址、VC运行库及NSIS自选目录/默认桌面快捷方式配置保留。白名单与生产依赖不混入用户库、账号、Chrome配置或源码映射。运行中的114预览目录未覆盖，发布审查补修在新客户包中。
