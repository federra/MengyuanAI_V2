// Shared by generation, Skill adaptation and downloadable import guidance.
export const storyboardRules = `分镜架构约定（director-storyboard/1.0）：
1. 项目 → 视频段（工作台的一行分镜）→ 段内子镜头。场次是叙事地点与时间单元，可以包含多个视频段，不等于分镜。一个视频段对应一次视频生成输入，不因内部切镜增加工作台行数。
2. 推荐使用 episodes 数组，每个元素是一个完整视频段。episodes[i].shots 才是该段内部子镜头。兼容顶层 shots 数组或裸数组：此时每个元素也必须是完整视频段，使用 duration、description、prompt 等平台字段，不能把子镜头混放到顶层。
3. 分镜数量 = episodes.length（兼容格式为顶层 shots.length）；总时长 = 各段 total_duration 之和（兼容格式为 duration 之和）。26段×10秒=26个分镜、260秒；即使内部有53个子镜头也不变。不能同时累加视频段时长和子镜头时长。最多200个视频段，子镜头不占此限额。
4. episodes 每段字段：video_id（非空唯一字符串）、scene_name（场景名）、characters（人物名数组）、total_duration（0.1至120的秒数）、shots（非空子镜头数组）。可选 source_refs（原文章节、段落或原镜号数组）、generation_prompt（整段独立生成提示词）、role_ids、scene_ids、prop_ids（实际引用资产ID数组）。
5. 每个子镜头字段：shot_id（段内唯一字符串）、time_start、time_end（数字秒数）、camera（景别、机位与运镜文本）、visual（画面与动作文本）、audio（按演出顺序保留说话人、台词、声线、情绪、画外音、音效与静音文字用途的文本）。时间轴每段从0重新开始，连续、无重叠无空洞，最后结束时间等于 total_duration。不能强迫各段时长相同；用户或Skill明确10秒时逐段10秒，否则根据可表演时长确定，不为凑固定分镜数量删剧情。
6. 新资产可放 missing_roles（role_id、role_name、description、可选visual_style）、missing_scenes（scene_id、scene_name、description）、missing_props（prop_id、prop_name、description、可选mobility、first_scene）。正文用“中文名 ( @role_xxx )”等引用。优先复用已有资产名与设定，每段只关联实际使用资产，默认仅保存到当前项目；不自动进入跨项目资产中心。
7. generation_prompt 是整段的完整制作输入，包含本段必要人物外观、场景与按秒组织的动作、对白及音效，不只列资产ID。无论是否提供该字段，导入都保留每个子镜头的时间、camera、visual、audio，不静默省略内容。导入后统一映射为一行分镜，内部时间轴完整写入画面描述与提示词。
8. 纯JSON，不加代码围栏、注释、占位省略号或第二个对象；字符串内换行使用JSON转义。顶层 episodes 与 shots 二选一。兼容格式可附 assets 数组，每项 kind、name、description，kind为人物、场景、道具、服饰、声音、风格或站位图。平台导出使用兼容格式，完整保存当前编辑内容及资产设定；项目备份另行导出，分镜JSON不携带素材文件或服务密钥。
9. 输入既有分镜且要求保真时保留视频段顺序、数量、时长与内容，不因有多个对白或camera切换重新拆段；确需重拆时由用户明确授权。生成前核对原文覆盖、对白时间预算与连续性，输出后核对完整JSON及以上时间约束。Skill负责创作方法，不能更改视频段与子镜头的层级定义。`;

export const episodeTemplate = {
  schema_version: 'director-storyboard/1.0',
  episodes: [
    {
      video_id: '01',
      scene_name: '清晨街角',
      characters: ['小猫'],
      total_duration: 10,
      source_refs: ['原文第1段'],
      shots: [
        {
          shot_id: '01',
          time_start: 0,
          time_end: 4,
          camera: '中景，固定机位',
          visual:
            '清晨街角 ( @scene_corner )，小猫 ( @role_cat ) 在邮筒旁停下，发现地上的蓝色信封 ( @prop_letter )。',
          audio: '环境声：轻风、远处脚步声。',
        },
        {
          shot_id: '02',
          time_start: 4,
          time_end: 10,
          camera: '近景，缓慢推进',
          visual:
            '小猫 ( @role_cat ) 拾起蓝色信封 ( @prop_letter )，看向信封背面。',
          audio: '小猫（清亮少年音，疑惑）：“这是谁留下的？”；音效：纸张轻响。',
        },
      ],
      role_ids: ['@role_cat'],
      scene_ids: ['@scene_corner'],
      prop_ids: ['@prop_letter'],
    },
  ],
  missing_roles: [
    {
      role_id: '@role_cat',
      role_name: '小猫',
      description: '灰棕色短毛猫，蓝色围巾。',
      visual_style: '统一动漫风格',
    },
  ],
  missing_scenes: [
    {
      scene_id: '@scene_corner',
      scene_name: '清晨街角',
      description: '石板路旁有一个邮筒，晨光从画面左侧照入。',
    },
  ],
  missing_props: [
    {
      prop_id: '@prop_letter',
      prop_name: '蓝色信封',
      description: '浅蓝色纸质信封，尚未拆开。',
    },
  ],
};
