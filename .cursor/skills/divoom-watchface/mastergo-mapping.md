# MasterGo → AstroToo 表盘映射参考

## URL 参数

```
https://mastergo.com/file/{fileId}?...&layer_id={layerId}
```

- `fileId`: 文件 ID  
- `layerId`: 根 Frame（如 `38:00367`），必须是 **480×480** 表盘 Frame  

## MCP 读取顺序

1. `mcp__getDesignSections` 无 `sectionIndex` → 概览  
2. `sectionIndex=0..N-1` 分批（每批 3–5）  
3. 需要绝对坐标时用 `mcp__getDsl` 一次取整树（含 `relativeX/Y`）  
4. 矢量装饰：`mcp__extractSvg` → PNG  
5. 位图 URL：DSL `styles.paint_*.value[].url` → curl 下载  

## 图层命名 → disp（导入脚本约定）

| MasterGo 图层名 | item_id 建议 | disp | font 建议 |
|-----------------|-------------|------|-----------|
| `bg` / `background` | `bg` | — | `DeviceImageUrl` |
| `dyn/time` / `24:28` | `time_main` | 4 | TTF 2/6/8；位图则 3+2 |
| `dyn/time_hms` | `time_hms` | 5 | TTF |
| `dyn/date` | `date_row` | 156 | TTF 2/6 |
| `dyn/week` | `week_row` | 37 | TTF 2/6 |
| `dyn/temp` | `temp_value` | 96 | TTF（含°） |
| `img/weather` | `weather_icon` | 55 | PNG |
| `img/wave` / 矢量组 | `wave_decor` | 48 | PNG |
| 时针/分针/秒针 | `hand_h/m/s` | 131/132/233 | PNG 方形 |

命名不标准时按 TEXT 内容 + 位置启发式推断，并在 JSON `item_id` 写清。

## 坐标字段映射

| MasterGo DSL | JSON 字段 |
|--------------|-----------|
| `layoutStyle.relativeX` | `x` |
| `layoutStyle.relativeY` | `y` |
| `layoutStyle.width` | `w` |
| `layoutStyle.height` | `h` |
| `textAlign: center` | `alig: 3` |
| `textAlign: left` | `alig: 4` |
| `textAlign: right` | `alig: 5` |
| `styles.paint_*` 纯色 | `color_1` |
| `font.size` | 见下节 |

坐标取 **整数**（`Math.round`）。

## 字号映射公式

### 1. 矢量 TTF（type=1）

MasterGo 文本节点字段示例：

```json
"font": { "family": "...", "size": 140 },
"layoutStyle": { "width": 343, "height": 120 }
```

映射：

```javascript
const mgSize = font.size;
const h = layoutStyle.height;
const size = Math.round(Math.min(mgSize, h * 0.85));
// JSON: size, x, y, w, h 如上
```

| MG fontSize | MG 框高 h | 推荐 JSON size |
|-------------|-----------|----------------|
| 140 | 120 | **102** |
| 66 | 57 | **56** |
| 35 | 43 | **30** |
| 30 | 26 | **26** |

**规则**：MG 允许字号大于框高；表盘 **不允许** `size > h`（会被裁切或溢出）。

**letterSpacing** → `sep`：`round(letterSpacing)`，仅 TTF 有效。

### 2. 位图 image_glyph（type=0）

MasterGo `font.size` **丢弃**，JSON：

```json
"size": 0,
"font": 24
```

| MG 设计 | 表盘行为 |
|---------|----------|
| Digital-7 140px | 无对应；用 font 24，**不看 140** |
| 框 343×120 | 仅用于对齐；字模不缩放 |
| 颜色 #FDE51E | IMG 字 **无效**；颜色 baked 在位图中 |

**MG → font 24 设计流程**：

1. MG 用 Digital-7 **做视觉稿**  
2. JSON 指定 `"font": 24`  
3. 导入编辑器看实际占位  
4. 只调 `w,h,x,y`，不调 `size`  

**charset 限制（当前仓库 font 24）**：`0123456789KM.$`

| 需显示 | 方案 |
|--------|------|
| `20:43` | TTF + disp 4，或 disp 3 + 2 无冒号 |
| `TUE` | TTF + disp 37，或 font 20（仅 A-Z） |
| `35°` | TTF + disp 96 |
| `06-04-26` | TTF；`-` 不在 font 24 charset |

### 3. MG 字体 → 系统 font 对照（推荐）

| MasterGo 视觉 | JSON font | type |
|---------------|-----------|------|
| Digital-7 / 七段数码 | 24 | 0 位图 |
| 英文无衬线 UI | 2 或 6 或 8 | 1 TTF |
| 仅大写英文 | 20 | 0 位图 A-Z |
| 仅数字 | 10 或 14 或 24 | 0 位图 |
| 数字 + 点 | 18 或 22 | 0 位图 |

**禁止**：MG 中用未入库字体做动态 TEXT 且期望 1:1（PingFang、Arial 等）。

## 颜色

- MG 纯色 `#FDE51E` → `"color_1": "#FDE51E"`（TTF 有效）  
- 位图字忽略 `color_1`；要变色请换 TTF 或重导出位图  

## 资源文件命名

| 用途 | JSON 字段 | 文件示例 |
|------|-----------|----------|
| 背景 | `DeviceImageUrl` | `dial_bg.png` |
| 元素图 | `ItemList[].image_addr` | `weather.png` |

放置：

- `public/<leaf>` — 导入时 HTTP 加载  
- `docs/examples/<project>/assets/` — 源文件归档  

## 不可 1:1 项（设计时规避）

- CSS/MG `box-shadow`、外发光 → 烤进 PNG 或删除  
- MG 矢量动态字（非系统 font）→ TTF 或 PNG  
- MG fontSize > h 且坚持 TTF → 必须压 size  
- 位图字冒号、中文、小写字母 → charset 外字符  

## Astro Echo 实例（fileId 195169154112546）

| 图层 | x,y,w,h | MG size | JSON 推荐 |
|------|---------|---------|-----------|
| 时间 | 18,151,343,120 | 140 | font **2**, size **102**, disp **4** |
| 温度 | 344,203,100,57 | 66 | font **2**, size **56**, disp **96** |
| 日期 | 83,301,125,26 | 30 | font **2**, size **26**, disp **156** |
| 星期 | 259,301,76,26 | 30 | font **2**, size **26**, disp **37** |
| 天气 | 363,293,63,62 | — | disp **55**, PNG |
| 波形 | 50,367,289,44 | — | disp **48**, PNG |

若坚持用 font 24 数码风格：时间改用 disp 3+2，且 w/h 按编辑器实测，size=0。
