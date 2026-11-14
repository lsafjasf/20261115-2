# 三折产品说明折页设计器

单页可展开三折产品说明：用户输入三段「标题 + 说明」，系统自动分配到**封面、内页、背页**三个面板。基于 Canvas 绘制折页、折线、安全边距与缩略图，支持导出 SVG / PNG 并保存版面 JSON。

## 运行

```bash
cd app
npm run serve        # http://localhost:5173
# 或直接用浏览器打开 index.html
```

## 测试与验证

```bash
npm test             # 纯逻辑单测 + Playwright 端到端验证（15 项）
```

端到端验证覆盖：三段自动分配、超长文本自动换行缩字且不越安全框、画布拖拽被安全区钳制、块顺序调整、SVG/PNG/JSON 导出，以及**重新载入后文本与拖拽位置完全一致**。

## 功能对照

- 三段输入 → 封面 / 内页 / 背页固定分配（`state.js` 的 `createDocument`）。
- 文字不越折线：`layout.js` 先贪心换行（中文按字、英文按词），再逐档缩小字号，所有块几何被限制在面板安全框内。
- 可拖动调整：侧栏拖拽行可重排或改投面板；画布上可直接拖动块，`clampToSafe` 保证不出安全区。
- 图片：点选图片块后上传，支持块内等比裁剪填充。
- 导出：PNG 来自 Canvas、SVG 由同一套布局几何序列化、JSON 保存完整版面（含固定块坐标）。
- 缩略图：`render.js` 的 `renderThumbnail` 在独立小画布等比绘制。

## 文件

- `layout.js` 纯布局引擎（换行、自适应、安全区、钳制）
- `state.js` 文档模型与分配 / 重排规则
- `render.js` Canvas 绘制、缩略图、SVG 序列化
- `app.js` UI、拖拽、导入导出与本地持久化
- `verify.mjs` Playwright 端到端验证
- `test-layout.mjs` 无浏览器布局单测

导出样例位于 `../artifacts/`（`brochure.png`、`brochure.svg`、`brochure-layout.json`）。
