# 账号授权 UI Demo

2026-09-15 需求对照修订。独立交互原型，适配现有浅色/深色主题，无真实 API 或用户数据。

从仓库根启动：

```sh
python3 -m http.server 4178 --bind 127.0.0.1 --directory docs/prototypes/access-admin
```

访问 `http://127.0.0.1:4178/`，或直接打开 index.html。默认只有登录页；单独 view=admin 不绕过登录。布局评审专用地址 `?review=1&view=admin`，深色增加 `&theme=dark`；review=1 才有场景切换。正式版本移除全部评审工具。

公开虚构账号：admin（超管）、member（会员）、expired（到期）、banned（封禁），密钥均为 `demo-key-2026`。member 对应 lin.director，expired 对应 wang.creator，banned 对应 xu.studio。新建模拟账号可用自设密钥登录；不要输入真实密钥。

表单登录后先进入原工作台占位，超管从系统设置下方进入后台。可验证：新增账号 → 退出 → 新账号登录；封禁/到期 → 登录拒绝；恢复/延期 → 重新登录。角色与页面分离，管理员可往返全部原业务入口。原业务页面仅占位，未复制生产功能。

统计、趋势、明细来自同一组虚构事件，超管不计入，新用户无使用记录；支持日期查询、分页、操作日志。第五项为系统成功导出视频文件，区分分镜和成片；本样例只含分镜视频，最终成片子项标注尚未接入。

全部状态和演示密钥仅存内存，刷新清除；模拟时钟从北京时间 2026-09-15 15:30 起随页面运行前进。密钥摘要、中央鉴权、跨设备统计均未实现。本目录不可作为正式认证代码复用。

验证：`node docs/prototypes/access-admin/test-state.mjs`。测试无网络、无真实用户、无模型调用。视觉和交互记录见 [QA](design-qa.md)；范围和实现见 [开发方案](../../access-control-design.md)。
