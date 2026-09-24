# AI 短片工作台 UI 调整 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 保留 idea/故事导入→X个故事备选→人工选择编辑→剧本→分镜→可选素材或直接视频→成品导出的主线，让高频创作更清楚、更紧凑。成品导出沿用当前系统能力，不新增渲染服务。

**Architecture:** 原页面、项目状态、业务回调和API继续使用，仅重排呈现并提取少量展示组件。分镜默认摘要、单镜头展开，资产可选，任务按对象展示。保持现有保存、任务身份、豆包回填及导出语义。

**Tech Stack:** 当前 React 19、TypeScript、vinext/Vite、Tailwind 与现有 UI 组件、Electron；不新增状态管理框架、数据库或渲染依赖。

**Spec:** [工作流与 UI 调整设计](../specs/2026-09-23-film-workflow-ui-adjustment-design.md)。执行前阅读根 AGENTS.md、docs/development-handoff.md；桌面验证另读 desktop/AGENTS.md。

## Global Constraints

- 本轮仅交付方案；本计划尚未执行，不是修改、迁移、付费调用或发布已完成的证明。
- 调整初估12人日、重做26人日；1人日=8小时有效工程工作。P0后仍按节省率≥50%选择调整的规则重算。
- 不增加强制审批页；用户在每个阶段编辑并主动触发下一次生成。X可配置，保留当前默认3及现有数量校验。
- 角色、场景、道具、站位图是按需制作分支；模型支持时允许分镜文字直接生成视频。
- 不增加内置MP4、云渲染、专业剪辑器、自动派发计划或全项目依赖失效系统。
- 不改数据库、项目身份、保存revision、模型/插件请求协议、账号授权与管理员已批准布局。
- 保留表格视图、配音/BGM、收益/渠道、所有导出及素材/Skill能力；图片原生窗口和清图防回显必须保留。
- 1440×900、100%缩放、详情折叠时分镜首屏至少4条完整摘要；不靠微型字压缩，正文建议14–16px。
- 使用隔离数据与独立预览，不覆盖运行中程序；打包、发布和真实模型生成按用户授权范围执行。

## Review Focus

1. 预览另一故事后点生成，或保存期间继续编辑：实际输入必须与用户选择一致，原稿不能丢失。第4/6步验证。
2. 分镜折叠、切换、排序、删除时有未提交输入或任务返回：编辑、焦点及原任务目标不能错位。第2/6步验证。
3. 无参考图、无角色、无台词的镜头：合法文生视频仍可提交，只有模型实际限制才阻塞。第3步验证。
4. 任务成功但被替换、目标删除、历史缺少关联：不能谎称当前使用，也不能应用到当前选中但无关镜头。第3步验证。
5. 旧项目、深浅主题、中文长文本、Windows原生目录及账号切换：保留功能与隔离，不为预览解除门禁。第6步验证。

---

## 一、改动边界与文件分工

| 路径 | 动作与职责 |
|---|---|
| app/page.tsx | 调整顶栏/导航层级、传递对象定位回调、阶段状态文案；不重写save/action/generate |
| components/creative-workspace.tsx | 故事数量、候选/当前正文、主次操作；保留现有生成快照与确认逻辑 |
| components/storyboard-rows.tsx | 原有控制器和编辑区，新增展开状态并接入摘要；保留豆包/素材回调 |
| components/storyboard-shot-summary.tsx | 新建纯展示摘要组件，不请求模型或保存项目 |
| components/project-asset-dialog.tsx | 参考/当前图片标签、名称字段尺寸、可选素材说明 |
| components/generation-tools.tsx | GenerationTasks结果卡、当前引用状态、返回目标；GenerationDialog主要改布局与标签 |
| lib/generation-task-presentation.ts | 新建纯函数，把Project/GenerationJob映射成显示标题、缩略素材和目标定位信息 |
| components/sequence-preview.tsx | 播放器高度、镜头条和缺失对象定位；不改同步音轨算法 |
| app/globals.css | 局部类名调整，复用主题变量，不全局重置所有按钮/输入 |
| tests/generation-task-presentation.mjs | 新建任务展示映射的行为测试 |
| desktop/test-workflow-ui.mjs | 新建组合UI验证，复用已有Electron隔离测试方式 |
| desktop/test-creative-workspace.mjs、test-storyboard-assets-ui.mjs、test-storyboard-import-ui.mjs | 更新必要选择器/隔离启动配置，保留已有回归断言 |
| docs/development-handoff.md | 实施后记录变更及真实验证状态；本轮方案不冒充开发完成 |

保存逻辑不移动，因此 tests/project-save-race.mjs 的现有源码定位仍可使用。P0发现必须大幅拆状态才能折叠编辑时，先修订估时，不能把“大重构”藏入3人日分镜项。

## 二、第1–2步：验证复用后先解决分镜

### 第1步｜P0：功能对照、原型与复用验证，1人日

**文件：** 新建 docs/prototypes/workflow-ui-adjustment/index.html、README.md；work/ui-audit-2026-09-23/ui-adjustment-estimate.md。原型只用明确标示的样本，不连接生产模型。

**输入→产物：** 现有审查＋设计规格→关键交互原型、功能对照表、修订估时；不是成品UI实现。

- [ ] 检查git状态、当前分支和相关未提交修改；阅读交接，记录实际运行UI版本与源码版本。
- [ ] 补走故事/剧本实看：生成X候选、预览、选用、手改、下一步生成、导入；模型响应使用测试夹具。记录哪些是已有能力、哪些仅需重排、哪些需新增接线。
- [ ] 建立功能对照表：旧入口→新位置→原处理函数→验收项，覆盖表格、台词音频、站位图、首帧、豆包、资产、Skill、导出、经营与管理员。
- [ ] 半天限时在隔离副本验证一个镜头的摘要/展开：编辑台词→折叠→展开→保存→重开，检查素材引用和原处理函数无需重写。实验不要提交真实生成。
- [ ] 原型展示分镜摘要/详情、故事预览/当前正文、任务结果卡及三条验收旅程；记录1440×900布局。
- [ ] 更新A/B剩余工作量并计算 `(B-A)/B`。A≤B/2继续调整，否则按用户规则改为重做方案；不因已画原型改变口径。

**退出条件：** 摘要能复用原控制器，有明确保存/回填验证；对本轮设计无关键歧义。P0的时间已包含在12人日内。

### 第2步｜P1：分镜摘要与展开详情，3人日

**文件：** components/storyboard-rows.tsx、components/storyboard-shot-summary.tsx、app/globals.css、desktop/test-workflow-ui.mjs。

**接口：** 保留StoryboardRows现有props；摘要接收Shot、索引、checked、expanded及原操作包装回调。checked沿用现有checkedShots，展开状态与selectedId分开，不能把选择行同时当批量勾选。

```ts
type ShotSummaryProps = {
  shot: Shot; index: number; checked: boolean; expanded: boolean;
  onCheck: (checked: boolean) => void;
  onToggle: () => void; onPreview: () => void; onGenerateVideo: () => void;
};
// 父组件连接既有入口，不在摘要内另发生成请求：
// onGenerateVideo={() => onGenerate({ id: shot.id, kind: 'video' })}
```

- [ ] 在UI测试先断言摘要能区分编号、画面、正文摘要、时长与状态，1440×900显示≥4条完整行；当前大行布局应无法满足该断言。
- [ ] 新建纯展示摘要，用稳定shot.id作key；图片预览、勾选、展开分别用独立按钮/checkbox，避免整行点击监听捕获所有操作。
- [ ] 将既有编辑区放在摘要下方；默认折叠，展开当前镜头，可额外固定一个比较。保持已有输入提交语义，折叠前同步临时字段；不通过改key重建编辑器。
- [ ] 按内容/声音、画面参考、生成设置分组原控件；空台词改“添加台词”入口；角色/场景/道具/站位图在摘要只显示数量、缩略图或实际缺项。
- [ ] 生成按钮加明确文字，删除收入更多菜单；保留上移/下移、插入、表格视图和原批量操作；折叠时对隐藏控件正确处理tab焦点。
- [ ] UI回归：编辑后折叠保留；勾选不展开；图片不触发生成；排序后仍编辑原shot.id；删除后焦点落在相邻可操作位置；任务回填不跳到别的镜头。
- [ ] 运行 `node tests/project-save-race.mjs`、`node tests/storyboard-flow.mjs`、`node desktop/test-workflow-ui.mjs`。测试启动配置按第6步隔离约定，不直接运行旧脚本默认的历史安装包。

**退出条件：** 总览密度达标且原镜头编辑/生成能力等价；没有为隐藏详情复制第二套业务状态。

## 三、第3–4步：让素材选择和文本生成清楚可控

### 第3步｜P1：资产可选分支与任务结果，2.5人日

**文件：** components/project-asset-dialog.tsx、components/generation-tools.tsx、lib/generation-task-presentation.ts、app/page.tsx、tests/generation-task-presentation.mjs、desktop/test-workflow-ui.mjs。

**接口：** 新增 `taskPresentation(project: Project, job: GenerationJob): TaskPresentation`；GenerationTasks新增可选 `onLocate?: (target: TaskLocation) => void`，由page切回对应镜头/资产。任务ID、onApply、onJob及backgroundJobs继续沿用。

```ts
type TaskLocation = { kind: 'shot' | 'asset'; id: string };
type TaskPresentation = {
  title: string;
  location?: TaskLocation;
  usage: 'current' | 'other' | 'no-result' | 'unresolved';
  media?: Media;
};
```

- [ ] 先写纯函数测试：当前video/image/blockingImage/asset图片及audio对应正确对象；audio有lineId则匹配台词音频，无lineId匹配镜头音频；跨projectId、缺少目标或缺媒体ID不得猜测“当前使用”。
- [ ] 同一目标结果media.id等于当前引用时usage=current；存在目标但引用不同为other，文案“可查看/替换”；无结果为no-result；关联不明为unresolved。不新建“曾经采用”审计历史。
- [ ] 任务标题显示真实项目和对象名称；结果图片/视频有缩略预览，音频有播放器和台词；提示词/模型/诊断折叠。预览及应用继续调用原函数。
- [ ] 接入onLocate，根据记录目标ID导航；目标已删除时禁用采用并说明，可保留素材，不用当前selectedId作为替代目标。
- [ ] 资产字段重命名、名称改单行；保留原生目录/选图、默认三视图、显式选择、dismissedImageId。区分项目引用与收藏复用，不引入新的共享范围。
- [ ] 生成面板展示当前模型/引用摘要：模型支持无图则允许直接视频；要求参考的通道仍用原校验。使用两类模拟模型验证，不能为了新入口绕过参数校验。
- [ ] 保持豆包自动回填和现有人工应用的差异，UI如实显示；不更改轮询、自动重试或下载机制。运行新增映射测试、原资产UI测试及 `node tests/video-context.mjs`、`node tests/video-generation.mjs`。

关键行为测试示例（测试文件按tests/core.mjs方式转译模块，导入exampleProject作夹具）：

```js
const project = exampleProject();
const shot = project.shots[0];
const media = {id:'result-1', name:'test.mp4', type:'video/mp4', url:'/test.mp4'};
shot.video = media;
const job = {id:'job-1', projectId:project.id, targetId:shot.id,
  target:'video', status:'completed', createdAt:'2026-09-23',
  model:'fixture', prompt:'fixture', media};
assert.equal(taskPresentation(project, job).usage, 'current');
shot.video = {...media, id:'replacement'};
assert.equal(taskPresentation(project, job).usage, 'other');
project.shots = [];
assert.equal(taskPresentation(project, job).usage, 'unresolved');
assert.equal(taskPresentation(project, job).location, undefined);
```

**退出条件：** 用户能走直接视频与资产辅助两条路线；任务显示结果所属对象及真实当前引用，不能错应用。

### 第4步｜P1：创意、候选故事与剧本，2人日

**文件：** components/creative-workspace.tsx、app/globals.css；必要调整app/page.tsx按钮接线；desktop/test-creative-workspace.mjs、desktop/test-workflow-ui.mjs。

**接口：** CreativeWorkspace仍使用project/stage/onEdit/onGenerate/onStage；沿用onGenerate第三参数source传递明确选中的Project快照，不从异步React更新后立即读取旧状态。

- [ ] 原型对照保留storyVersionCount、当前默认3、既有上限和输入校验；按钮显示“生成X个故事方案”，导入已有故事为清楚的独立入口。
- [ ] 候选列表紧凑显示标题/选中状态/预览入口，正文始终是主要区域；当前编辑与候选预览有显著区分。
- [ ] 用当前故事生成剧本、采用候选并生成剧本分别保留清楚的输入来源；故事与剧本仍是两个阶段，不新增重复“确认通过”页面。
- [ ] 保留另存、导入、手改、Skill、撤销和生成结果应用；把重生成/历史版本/助手降为次级操作，模型与Skill当前选择仍可见。
- [ ] 用测试夹具验证3个候选和修改数量；预览B不改A正文；手改A后生成使用手改文本；采用B生成使用B；请求失败保留旧剧本；导入故事不先调用候选生成。
- [ ] 运行 `node tests/creative.mjs`、`node tests/project-save-race.mjs`、`node tests/storyboard-normalize.mjs` 及更新后的创作UI测试。

**退出条件：** 用户清楚自己选中/编辑的是哪个版本，每次下游生成输入与其选择一致。

## 四、第5–6步：统一交互并完成回归

### 第5步｜P2：导航、预览与导出，1人日

**文件：** app/page.tsx、components/sequence-preview.tsx、app/globals.css、desktop/test-workflow-ui.mjs。

**接口：** SequencePreview继续使用onEditShot(id)定位缺失镜头和onExport开启原导出；不重做播放器或导出服务。

- [ ] 侧栏按创作/经营/设置分组，保留入口顺序约束和管理员权限；五阶段仍使用现有映射。减少顶栏重复区域，当前阶段一个主要推进动作。
- [ ] stageDone相关标记改为“已有内容”等真实语义，已有reviewRequired显示待复核；不把有正文说成人工审定完成。
- [ ] 预览播放器设置随视口变化的高度上限，使序列条和主要控制同屏；缺项按钮调用onEditShot实际ID。
- [ ] 导出文案按继续剪辑、素材字幕、项目备份组织，注明输出内容与后续成片位置；所有既有导出按钮保持原执行路径。
- [ ] 统一标签、关闭按钮中文、键盘焦点、状态文字和主题对比；确认展开内容不会被固定工具栏遮挡。
- [ ] 1440×900及1366×768、双主题人工检查；导出映射与原路径逐项核对，不为低影响文案新增脆弱快照测试。

**退出条件：** 主动作和导航清楚，预览/导出没有夸大能力，经营与管理员入口保持可用。

### 第6步｜必须：回归与交接，2.5人日

**文件：** 新旧UI测试、docs/development-handoff.md；实际交付时遵守desktop/AGENTS.md及共用runtime白名单。

**输入→产物：** 已调整UI→可复现测试记录、关键截图、功能对照结果和剩余风险；模拟通过与实机通过分开。

- [ ] 修正旧Electron测试的历史版本默认值与选择器，使用独立构建/数据目录和正式门禁支持的测试身份；不删除鉴权。测试夹具不进入发行版。
- [ ] 跑通三条完整旅程：idea到直接视频；导入故事到素材辅助视频；旧项目只修改一个镜头。生成先使用模拟响应，真实模型次数/额度另行明确。
- [ ] 验证保存中编辑、真实409、断线恢复、预览不覆盖、清图不回显、sourceMetadata保留、豆包结果回填原目标；运行 `node tests/project-save-race.mjs`、`node tests/project-recovery.mjs`、`node tests/doubao-result-recovery.mjs` 和相关UI脚本。
- [ ] 50镜头、长中文正文、空台词、无资产、历史失效目标、深浅主题、缩放与键盘操作回归；全功能对照表逐项检查，不能把表格、配音或导出藏没。
- [ ] 运行 `npm run lint`、`npm run build`；记录已有基线失败与新失败的区别，不以UI工作为理由改无关模块。
- [ ] Mac和Windows各做界面、原生文件选择、已有项目打开/保存、生成模拟回填与导出入口实机验证。Windows设备不可用时明确待验，不宣称双端通过。
- [ ] 交接记录源码/模拟/真实模型/实机/发布分别达到什么状态。用户授权交付后才升版、独立打包；不要覆盖运行中的旧版，不自动上传发布。

**退出条件：** 没有数据丢失、错用版本、任务错绑、无意调用和原功能缺失；所有未完成实测清楚列出。

## 五、时间与范围控制

顺序固定为：P0验证1天 → 分镜3天 → 资产/任务2.5天 → 故事/剧本2天 → 导航/预览1天 → 回归2.5天，共12工程人日。单人全时约2.4工作周，仅作为投入估算，不包含硬件、模型服务和用户评审等待，也不是完工承诺。

收益与判断重点：第2步解决首屏分镜数量和重复滚动；第3步解决生成对象与当前使用结果识别；第4步解决选用/编辑/生成的理解成本。不要先做全站配色、动效或框架迁移。若实际发现必须新增后端或重建状态体系，先将新增范围同时计入A/B再重算，不能悄悄追加。

本次分析与文档自检不等于上述测试已执行。执行起点是P0；方案已充分说明优先级、目标文件、接口、步骤和验收条件。

2026-09-23 原型进展：独立低保真原型位于 `docs/prototypes/workflow-ui-adjustment/`，覆盖完整五阶段与素材分支。仅完成原型范围的浏览器验证；P0真实源码复用计时及正式系统调整尚未执行。
