# 原始素材下载适配记录

以下为历史记录。2026-09-15 的当前实现（桌面 0.1.61 / 助手 0.13.3）已改用豆包官方账号设置及 `/creativity/resource/get_without_watermark` 成品接口，不再改写 CDN 参数。AI 生成明水印和豆包品牌水印分开判断，详见 [桌面说明](README.md)。

2026-09-13，桌面版 0.1.50 / 扩展 0.12.7。

## 本地参考插件

用户提供的“豆包下载器”1.0.3 通过 JSON.parse 读取 creations 中的 image.image_ori_raw.url，并用该地址覆盖图片显示地址，下载原文件。其业务逻辑只处理图片，没有视频去水印算法。目录没有整体许可证；打包文件中的 React 等第三方许可不代表插件业务代码已获商用授权。本项目只研究字段含义，未复制代码、界面或资源，也不改写豆包原页面的响应数据。

## 已定位的问题与修复

两条本机成功视频任务的下载地址包含 lr=video_gen_watermark_dyn。仅凭 original_media_info 字段名称无法排除这种动态水印地址。

- 图片优先使用 image_ori_raw，排除 image_ori、image_preview、image_thumb 中的展示地址；原图下载入口增加缩略图。
- 视频仅对 v数字-videoweb.doubao.com 上已识别的 video_gen_watermark / video_gen_watermark_dyn 渲染参数切换到 video_gen_no_watermark，其他查询参数与签名编码保持不变。参考公开的 [CDN 参数说明实现](https://github.com/chuansd/doubao-international/blob/main/content.js)，独立实现范围更窄的地址处理。
- 明确带水印标志或未知带水印预设的候选不当作原文件。明确 no_watermark_url 优先于泛化的 original_url。
- 自动回传、插件手动下载及旧任务重新获取均应用相同规则；不会重发生成请求。已落盘的视频不会自动覆盖，需要重新获取或重新下载。
- 保持下载、回传及保存凭据完成后才关闭原任务页的行为。

## 验证范围

最近一条实际历史视频的修正地址通过只读 HEAD 检查，返回 HTTP 200、video/mp4。没有再次生成，也未消耗生成次数。此检查验证下载地址可用，不代表逐帧视觉检查；模型已烘焙进画面的文字或标志不由地址切换擦除。原图字段使用结构化模拟响应验证。

自动测试覆盖原图与预览图同时返回、嵌套 JSON、Base64 视频链接、签名保留、候选优先级、未知域名与水印参数拒绝，以及手动和自动下载规则一致性。
