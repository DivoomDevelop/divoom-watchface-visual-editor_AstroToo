---
name: divoom-watchface
description: >-
  Generates Divoom AstroToo 480×480 watchface JSON from MasterGo designs or
  specs. Covers disp/font mapping, MasterGo DSL→config coordinates, TTF vs
  bitmap font size rules, asset export, and import into AstroTooPCDailTool.
  Use when the user mentions 表盘、watchface、dial、MasterGo 设计导入、disp、font id,
  ItemList, or Astro Echo watchface authoring. Use when matching design font names to
  simulator font id, font_info.cfg, or GetTimeDialFontV2 names.
---

# Divoom AstroToo 表盘生成

PC 编辑器：**480×480** 逻辑画布。输出 JSON 符合 `docs/watchface-config.schema.json`，导入编辑器「导入」按钮加载。

## 必读资料（生成前先读）

| 文件 | 用途 |
|------|------|
| `public/font/font_info.cfg` | **字体名称 ↔ 模拟器 `font` ID**（`FontList[].name` / `.id`） |
| `docs/generated/ai-font-catalog.json` | 合法 `font` id、type、charset、**name**（由 cfg 生成） |
| `docs/generated/ai-font-guide.md` | 字体选型与场景 |
| `docs/generated/disp-catalog.json` | 合法 `disp` id |
| `docs/AI_WATCHFACE_GUIDE.md` | 坐标、指针、验证流程 |
| [mastergo-mapping.md](mastergo-mapping.md) | MasterGo 图层命名、字号映射、disp 表 |

生成前运行（若 font/disp 可能过期）：`npm run gen:ai-docs`（**改 `font_info.cfg` 或同步新字体后必须跑**，否则 catalog 里的 name 会过期）

## 字体名称 → 模拟器 `font` ID

表盘 JSON 的 `ItemList[].font` **默认写整数 ID**；也支持 **字体名称**（导入时由编辑器按 `font_info.cfg` 解析为 ID）。

| 写法 | 示例 | 说明 |
|------|------|------|
| 数字 ID | `"font": 8` | 推荐；与固件/模拟器一致 |
| 数字字符串 | `"font": "8"` | 等价于 ID 8 |
| 名称写在 `font` | `"font": "DS-Digital Bold"` | 按 `name` 精确/唯一模糊匹配 |
| 独立名称字段 | `"font_name": "Bebas Neue"` | `font` 可为 0 或省略 |

`name` 来自 `public/font/font_info.cfg`（可通过 **「更新字体」** 从 `Device/GetTimeDialFontV2` 同步）。  
PC **模拟器预览**与固件均按解析后的 **ID** 加载 `(id+1).bin`。

### 去哪查

| 需求 | 来源 |
|------|------|
| 名称 → ID（权威） | `public/font/font_info.cfg` → `FontList[]` 的 `name` + `id` |
| AI / 脚本批量查 | `docs/generated/ai-font-catalog.json` → `fonts[].name` + `fonts[].id` |
| 编辑器目视 | 元素属性标签：`字体 (OPPO Sans-Blod #2)`；字体下拉：`OPPO Sans-Blod (#2) [TTF]` |
| 补全 / 更新名称 | 编辑器 **「更新字体」** → `Device/GetTimeDialFontV2` 合并写入 `font_info.cfg` |

### AI 查 ID 步骤

1. 读 `public/font/font_info.cfg`（或已生成的 `ai-font-catalog.json`）。
2. 在 `FontList` / `fonts` 里按 **`name` 模糊匹配**设计稿或用户给出的字体名（注意拼写差异，如 `Blod` / `Bold`、全角括号）。
3. 取匹配行的 **`id`** 写入 JSON：`"font": <id>`。
4. 核对 **`type`**：`1` = TTF（可调 `size`/`color_1`/`sep`）；`0` = 位图字（仅 `x,y,w,h,alig`，`size` 写 0）。
5. 位图字再核对 **`charset`**，动态文本字符必须 ⊆ charset。
6. 若 cfg 无该字体：编辑器「更新字体」下载后再查；仍无则勿臆造 ID。

### 名称关键词 → 常见 ID（本仓库 bundled，**以 cfg 为准**）

设计/MasterGo 里若出现下列关键词，优先在 cfg 里按 `name` 确认 ID：

| 设计侧名称 / 关键词 | 模拟器 `font` | cfg `name` | type |
|---------------------|---------------|------------|------|
| OPPO Sans / OPPOSans 常规 | **2** | OPPO Sans-Blod | TTF |
| OPPOSans Heavy / 粗黑 | **6** | 005-OPPOSans Heavy | TTF |
| OPPOSans Medium | **28** | OPPOSans Medium | TTF |
| DS-Digital / 数码管 | **8** | DS-Digital Bold | TTF |
| Bebas Neue / 英文大标题 | **12** | Bebas Neue | TTF |
| 22×39 白块数字 / 时间日期位图 | **10** | 22*39数字(时间日期)白色方块字体 | IMG |
| 26×48 白块数字 / 比分 | **14** | 26*48数字（比分）白色方块字体 | IMG |
| 56×112 数字 km.$ | **16** | 56*112数字/字符 | IMG |
| 54×76 neno 数字 | **18** | 54*76数字-neno | IMG |
| 大写英文字母 A–Z | **20** | 40*68大写字母字体-白色（26个） | IMG |
| 44×76 黄色数字 | **22** | 44*76数字-黄色 | IMG |
| DS Digital 位图 / 56×112 白数字 | **24** | 56*112数字-白色 | IMG |

同一视觉风格可能对应多个 ID（不同字重或位图/TTF 版本）；**以 cfg 条目为准**，不要只凭 MasterGo 组件名猜 ID。

### 文件与 ID 对应（固件规则）

- 字体文件：`public/font/{id + 1}.bin`（例：`font: 2` → `3.bin`，`font: 28` → `29.bin`）
- cfg 元数据：`public/font/font_info.cfg`（含 `name`、`url`、`charset`）

```json
// 方式 A：ID
{ "item_id": "time_main", "disp": 4, "font": 8, "size": 56, ... }

// 方式 B：名称（导入后归一化为 ID）
{ "item_id": "time_main", "disp": 4, "font": "DS-Digital Bold", "size": 56, ... }

// 方式 C：font_name
{ "item_id": "title", "disp": 37, "font": 0, "font_name": "Bebas Neue", "size": 30, ... }
```

```json
// font_info.cfg 片段 — 名称与 ID 对照
{ "id": 8, "name": "DS-Digital Bold", "type": 1, "charset": "" }
// → 可写 "font": 8 或 "font": "DS-Digital Bold"
```

## 工作流

### A. 从 MasterGo 设计生成

1. 从 URL 解析 `fileId`、`layerId`（根 Frame，通常 480×480）。
2. 用 MasterGo MCP **`mcp__getDesignSections`**（先无 sectionIndex 概览，再逐 section）或 fallback **`mcp__getDsl`** 取完整树与 `relativeX/Y/width/height`。
3. 静态位图：从 DSL `paint_*` URL 下载（MasterGo 常为 PNG）；矢量 PATH 用 **`mcp__extractSvg`** + 栅格化。**交付前全部转为 WebP**（见「资源格式」）。
4. 按 [mastergo-mapping.md](mastergo-mapping.md) 映射图层 → `disp` / `font` / 坐标。
5. 写入 `docs/examples/<name>-watchface.json`；资源放 `public/examples/<name>/assets/` 与 `public/` 叶子名（**均为 `.webp`**）。
6. 运行 `node scripts/validate-astro-echo-watchface.mjs`（可改路径）或手动对照编辑器预览。

### B. 纯文本/规格生成

1. 只使用 `allowedFontIds`（或由名称解析得到的 ID，见下节）。
2. 每个动态元素必须有合法 `disp`。
3. 位图字字符必须在 `charsetPreview` 内。
4. **`font` 可写 ID 或名称**（见「字体名称 → 模拟器 font ID」）；导出/下发前编辑器会归一化为整数 ID。
5. 输出最小字段：`ClockId:0`, `NameCn/En`, `ItemIdList`, `ItemList[]`（含 `item_id,disp,font,x,y,w,h,alig,size,sep,color_1,hier,image_addr`）。

### C. 交付与导入

- JSON：`docs/examples/*.json` + 镜像 `public/examples/*.json`
- 图片：**全部为 WebP**，`public/<leaf>.webp`（与 JSON 中 `DeviceImageUrl` / `image_addr` 扩展名一致）
- 用户在编辑器点 **导入**，选择 JSON；资源从 `public/` 自动解析

## 资源格式（WebP 强制）

**所有栅格资源必须以 `.webp` 交付**，包括背景、天气图标、装饰图、指针图、App 预览图等。JSON 中的 `DeviceImageUrl`、`AppImageUrl`、`ItemList[].image_addr` 叶子名必须带 `.webp` 后缀。

| 步骤 | 说明 |
|------|------|
| 1. 获取源图 | MasterGo CDN / SVG 栅格化 / 设计稿导出（常为 PNG） |
| 2. 转 WebP | 交付前统一转换，**不要**在 JSON 或 `public/` 留 `.png`/`.jpg` |
| 3. 命名 | 小写+下划线，如 `dial_bg.webp`、`weather_icon.webp` |
| 4. 双份归档 | `public/<leaf>.webp` + `docs/examples/<name>/assets/<leaf>.webp` |

**转换方式（任选其一）：**

```bash
# cwebp（推荐，需 libwebp）
cwebp -q 90 input.png -o output.webp
cwebp -lossless input.png -o output.webp   # 小图标/透明装饰

# ffmpeg
ffmpeg -i input.png -quality 90 output.webp

# Node sharp
node -e "import('sharp').then(s=>s.default('in.png').webp({quality:90}).toFile('out.webp'))"
```

**质量建议：**

- 480×480 全屏背景：`quality 85–92`
- 小图标 / 透明装饰：`-lossless` 或 `quality 95+`
- 含 glow/阴影的烤图：与 MG 目视对比后微调 quality

**禁止：** JSON 引用 `.png` 而磁盘只有 `.webp`（或反之）；混用多种扩展名。

## 字号与布局（核心规则）

### 矢量 TTF（type=1：id 2,6,8,12,28 等，见 font_info.cfg）

MasterGo `fontSize` **可映射**到 JSON `size`：

```
size = round(min(mgFontSize, mgBoxHeight * 0.85))
```

- `x,y,w,h` = MG 文本框 `relativeX, relativeY, width, height`（整数）
- `color_1` = MG 文字填充 `#RRGGBB`
- `sep` = MG `letterSpacing`（px，可四舍五入）
- **约束**：`size ≤ h`；MG 里 fontSize > h 时，表盘侧必须压到 `size ≤ h×0.85`
- 含 **`:`、字母、中文、°** 的动态文本 → **必须用 TTF**

### 位图字 image_glyph（type=0：id 10,14,16,18,20,22,24）

MasterGo `fontSize` **无效**，不要写入 JSON 做缩放依据：

```
size = 0   // 或省略；编辑器对 IMG 字忽略 size/color/sep
```

- 只用 `x,y,w,h,alig` 排版；模拟器按字模 **原始像素** 绘制，**不会**缩放进 w×h
- MG 框尺寸必须 ≥ 导入后在编辑器实测的字模占位；迭代：导入 → 看预览 → 回改 w/h
- 字符集见 catalog；**无冒号** → `HOUR_MIN(4)` 不可用，改 `HOUR(3)+MIN(2)` 或 TTF
- font **24**（DS Digital 位图，name=`56*112数字-白色`）：`0123456789KM.$` — 仅数字/少量符号

### 对齐

| MG textAlign | JSON alig |
|--------------|-----------|
| center | 3 |
| left | 4 |
| right | 5 |

## 图层类型决策

| MG 内容 | 表盘处理 |
|---------|----------|
| 全屏背景 | `DeviceImageUrl` + **WebP** |
| 动态时间/日期/天气文字 | TEXT → `disp` + `font` |
| 固定装饰/自定义 MG 字体/ glow | 栅格化 → **WebP** → `image_addr` + 图片类 `disp` |
| 指针 | `disp` 131/132/233，方形 **WebP**，见 AI_WATCHFACE_GUIDE |

**不支持**：box-shadow/glow 独立层、未入库字体、MG 专有矢量动态字。

## 常用 disp（动态文本）

| 用途 | disp | 备注 |
|------|------|------|
| 时:分 | 4 | 需 TTF 或 charset 含 `:` |
| 时:分:秒 | 5 | 同上 |
| 时 / 分 / 秒 分开 | 3 / 2 / 1 | 位图数字常用 |
| 英文星期 | 37 | 需 TTF 或 charset 含字母 |
| 月-日 | 156 | 格式以固件为准 |
| 温度 | 96 | 含 ° 用 TTF |
| 天气图标 | 55 | WebP + `image_addr` |
| 中宽装饰图 | 48 | WebP |

完整列表：`docs/generated/disp-catalog.json`

## JSON 片段模板

```json
{
  "ClockId": 0,
  "NameCn": "表盘名",
  "NameEn": "Dial Name",
  "DeviceImageUrl": "dial_bg.webp",
  "ItemIdList": ["time_main"],
  "ItemList": [{
    "item_id": "time_main",
    "disp": 4,
    "font": 2,
    "size": 102,
    "x": 18, "y": 151, "w": 343, "h": 120,
    "alig": 3, "sep": 2,
    "color_1": "#FDE51E", "color_2": "#000000",
    "hier": 6, "transp": 100,
    "image_addr": ""
  }]
}
```

## MasterGo 设计师规范（写入设计说明）

1. 根 Frame **480×480** px  
2. 图层命名：`dyn/time`、`dyn/date`、`img/weather`、`bg`（见 mastergo-mapping.md）  
3. 动态字：组件库绑定 **TTF 参考**（非 Digital-7 实例）或位图 charset  
4. TTF：`fontSize ≤ 框高×0.85`  
5. 位图：框按编辑器实测调整，不依赖 MG 字号  
6. 特效 → 合并进 **WebP** 再导出  

## 验证清单

- [ ] 所有 `font` ∈ `allowedFontIds`（由 `font_info.cfg` 生成；名称匹配后取对应 `id`）
- [ ] 位图字文本 ⊆ charset
- [ ] `x,y,w,h` 在 0..480，且不越界
- [ ] TTF 的 `size ≤ h`
- [ ] 所有图片资源为 **`.webp`**，JSON 路径与磁盘一致
- [ ] 资源叶子名与 `public/` 文件一致
- [ ] 编辑器导入后目视对比 MG 设计

## 仓库路径

| 路径 | 说明 |
|------|------|
| `src/editor/fontResolve.js` | 字体 ID / 名称解析 |
| `src/editor/watchfaceImport.js` | 导入解析 |
| `src/editor/app.js` | `drawImageFontText`、disp 常量 |
| `docs/examples/` | 示例 JSON |
| `public/` | 运行时资源 |

详细 MasterGo→JSON 映射与字号公式：[mastergo-mapping.md](mastergo-mapping.md)
