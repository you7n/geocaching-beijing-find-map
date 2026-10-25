# 数据审计与选型说明

## 1. GPX 检查

文件：`26075397.gpx`

- 文件大小：3,046,462 bytes
- 结论：有效 GPX XML，根元素为 `<gpx>`
- 生成器：`Groundspeak Pocket Query`
- 文件名标题：`My Finds Pocket Query`
- 航点总数：741

### 结构特征

每个实际缓存记录都以 `<wpt lat="..." lon="...">` 表示，并包含：

- `<name>`：稳定 GC code，例如 `GCAKXAA`
- `<desc>`：缓存标题、作者、类型、难度
- `<sym>`：样例中均为 `Geocache Found`
- `<type>`：如 `Geocache|Traditional Cache`
- `<groundspeak:cache id="...">`：缓存主体
- `<groundspeak:name>`：缓存标题
- `<groundspeak:type>`：缓存类型
- `<groundspeak:logs>`：日志列表

### 找到状态判定

样例里绝大多数记录包含：

- `Found it`

另有 11 条活动缓存仅有：

- `Will Attend`
- `Attended`

因此当前实现使用以下保守规则判定“计入已完成记录”：

1. 必须存在 `<groundspeak:cache>`
2. 必须有合法坐标
3. 必须有合法 GC code
4. 满足以下任一项：
   - `<sym>` 为 `Geocache Found`
   - 日志中含 `Found it`
   - 日志中含 `Attended`

### 辅助航点

在样例文件中，没有发现不带 `<groundspeak:cache>` 的 parking / trailhead / reference waypoint。

实现仍然显式跳过这类航点，避免把普通 `<wpt>` 误算为 find。

## 2. 三份候选北京数据

### A. `area/province/110000.json`

- 文件大小：727 bytes
- 类型：JSON array，不是 `FeatureCollection`
- 条目数：16
- 示例属性：`{"id":"110101","level":4,"name":"东城区"}`
- 作用：仅提供北京市 16 个区的名称与代码
- 几何：无
- 适合浏览器渲染：不适合，缺少 geometry

### B. `全国省市县边界GEOJson数据(不含乡镇街道)(边界数据未压缩)/map/province/110000.json`

- 文件大小：44,551 bytes
- 类型：`FeatureCollection`
- 要素数：16
- 属性字段：`id`, `level`, `name`
- 示例属性：`{"id":"110101","level":4,"name":"东城区"}`
- 几何类型：`Polygon`, `MultiPolygon`
- 坐标范围：`115.41685521,39.44466013` 到 `117.5080988,41.05907133`
- CRS 判断：经纬度范围符合 WGS84 / GeoJSON 标准表达
- 覆盖范围：北京市 16 个区
- 适合浏览器渲染：适合，体积小、结构直接可用

### C. `全国省市县边界GEOJson数据(不含乡镇街道)(边界数据已压缩)/map/province/110000.json`

- 文件大小：5,993 bytes
- 类型：`FeatureCollection`
- 要素数：16
- 属性字段：`id`, `level`, `name`
- 几何类型：压缩后的 ECharts UTF8Encoding
- 覆盖范围：同样是北京市 16 个区
- 适合浏览器渲染：需先解码，直接使用不如未压缩版稳妥

## 3. 旧数据中的乡镇级名称

目录：`area/county/*.json`

北京 16 个区对应文件中，包含下级行政单位名称与代码，例如：

- `110101001 东华门街道`
- `110105043 首都机场街道`
- `110111218 蒲洼乡`
- `110112213 于家务回族乡`

合计：331 条

但这些文件仍然只有：

- `id`
- `level`
- `name`

没有 geometry。

这意味着旧数据只能证明项目目标是乡镇级，但不能独立支撑乡镇级点面匹配。

## 4. 新补入的可用乡镇级数据

目录：`110100_110100_批量下载`

### 县级

- 文件：`县级/县级边界_110100.geojson`
- 要素数：16
- 几何类型：`MultiPolygon`
- 属性很多，包含：
  - `地名`
  - `区划码`
  - `县级`
  - `省级`
  - `year`
- 坐标系：`.prj` 明确为 `GCS_WGS_1984`

### 乡镇级

- 文件：`乡镇/乡镇边界_110100.geojson`
- 要素数：334
- 几何类型：`MultiPolygon`
- 关键属性：
  - `name`
  - `code`
- 坐标系：`.prj` 明确为 `GCS_WGS_1984`
- 坐标范围：与北京市范围吻合
- 示例：
  - `name: 和平里街道办事处`
  - `code: 110101010000`

### 村级

- 文件：`村级/村位置_点数据_110100.geojson`
- 要素数：7468
- 几何类型：`Point`
- 当前不用于本项目核心匹配
- 文件中坐标范围明显超出北京，暂不作为行政边界依据

## 5. 为什么最终选择两套边界同时保留

最终选中：

- `全国省市县边界GEOJson数据(不含乡镇街道)(边界数据未压缩)/map/province/110000.json`
- `110100_110100_批量下载/乡镇/乡镇边界_110100.geojson`

原因：

1. 区级未压缩 GeoJSON 很轻，适合总览。
2. 新乡镇 GeoJSON 提供了真正可用的 334 个乡镇级 polygon。
3. 两套数据都使用 WGS84，能直接与 GPX 坐标匹配。
4. 乡镇原始 GeoJSON 属性冗余较少，但文件较大，因此项目会预处理成精简版。
5. 保留区级和乡镇级切换，更符合真实使用场景。

## 6. 预处理结果

项目通过 `npm run prepare-data` 生成：

- `public/data/beijing-districts.geojson`
- `public/data/beijing-townships.geojson`

其中：

- 区级精简后约 45 KB
- 乡镇级精简后约 8.17 MB

精简操作包括：

- 删除冗余字段
- 统一属性为 `id/code/name/level/parentCode/parentName`
- 将坐标保留到 6 位小数

## 7. 当前可复现结果

使用示例 GPX 与区级边界数据：

- 载入边界：16 个区
- 解析唯一缓存：741
- 命中北京区级边界：545
- 未命中：196
- 点亮区域：7
- 完成率：43.75%

已点亮：

- 东城区
- 西城区
- 朝阳区
- 丰台区
- 海淀区
- 昌平区
- 怀柔区

使用示例 GPX 与乡镇级边界数据：

- 载入边界：334 个乡镇级单元
- 解析唯一缓存：741
- 命中北京乡镇级边界：545
- 未命中：196
- 点亮区域：65
- 完成率：19.46%
