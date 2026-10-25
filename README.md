# 北京 Geocaching 行政区 Find Map

一个本地运行、浏览器内处理 GPX 的个人 Geocaching 进度地图。

当前同时支持：

- 北京市 16 区区级边界
- 北京市 334 个乡镇级边界

## 当前实现范围

这版应用已经完成：

- 本地导入 `My Finds Pocket Query .gpx`
- 解析 Groundspeak Pocket Query 结构
- 去重缓存记录，兼容普通缓存与仅有 `Attended` 日志的活动缓存
- 使用北京行政边界做点面匹配
- 在地图上显示已访问/未访问区域
- 展示完成率、未命中数量、区域列表与选中区域详情
- 导出区域统计 CSV
- 附带测试与端到端报告脚本

## 重要限制

现在仓库中已经补入新的乡镇级 polygon 数据，因此应用支持区级 / 乡镇级双层级切换。

仍需注意：

- 乡镇级边界来自 `110100_110100_批量下载/乡镇/乡镇边界_110100.geojson`
- 原始文件较大，项目会先生成精简版 `public/data/beijing-townships.geojson`
- 村级点数据未接入地图匹配逻辑

详见 [docs/data-audit.md](docs/data-audit.md)。

## 运行

已处理好的精简边界数据随仓库提供，无需额外准备步骤：

```bash
npm install
npm run dev
```

默认地址：

```text
http://127.0.0.1:4173
```

生产构建：

```bash
npm run build
npm run preview -- --host 127.0.0.1 --port 4173
```

## 部署到 Cloudflare Pages

本项目是纯静态应用，所有 GPX 解析与点面匹配都在浏览器内完成，不需要后端、数据库或 API Key。

| 配置项 | 值 |
| --- | --- |
| Build command | `npm run build` |
| Output directory | `dist` |
| 环境变量 | 无 |

注意事项：

- 应用使用 `/data/...` 绝对路径加载边界数据，且 Vite 未设置 `base`，因此**必须部署在域名根目录**；放在子路径下会 404。
- 页面不依赖任何在线底图，边界多边形可独立渲染。

## 未纳入版本库的内容

以下内容已写入 `.gitignore`，不会上传到 GitHub，也不影响部署：

- **原始地理数据集**（`area/`、`110100_110100_批量下载/`、`全国省市县边界GEOJson数据(...)` 两个目录，合计约 125MB）  
  这些仅用于本地生成精简边界。应用实际加载的是已经提交的 `public/data/beijing-districts.geojson` 与 `public/data/beijing-townships.geojson`，因此克隆后开箱即用。如需重新生成，请先准备这些原始数据，再运行：
  ```bash
  npm run prepare-data
  ```
- **个人 GPX 文件**（`*.gpx`）  
  含 GC 代码、坐标与完整查找历史，属于个人数据，不作为公开仓库内容。测试与报告脚本在文件缺失时会自动跳过。

## 测试

```bash
npm test
```

其中端到端用例依赖仓库根目录的个人 GPX 文件；该文件不存在时这组用例会自动跳过，其余用例照常执行。

生成使用指定数据的报告：

```bash
npm run report -- /path/to/MyFinds.gpx
```

## 使用的数据

- 选中边界数据：`public/data/beijing-districts.geojson`
- 乡镇边界数据：`public/data/beijing-townships.geojson`
- 区级来源：`全国省市县边界GEOJson数据(不含乡镇街道)(边界数据未压缩)/map/province/110000.json`（本地数据，未提交）
- 乡镇级来源：`110100_110100_批量下载/乡镇/乡镇边界_110100.geojson`（本地数据，未提交）
- 个人 GPX：本地提供，未提交

## 端到端结果

基于本地个人 GPX 与当前边界数据（该 GPX 未包含在仓库中）：

### 区级

- 载入行政区：16
- 解析唯一缓存：741
- 匹配到北京区域：545
- 未命中北京区域：196
- 点亮区域：7
- 完成率：43.75%

已点亮区域：

- 昌平区
- 朝阳区
- 东城区
- 丰台区
- 海淀区
- 怀柔区
- 西城区

### 乡镇级

- 载入行政区：334
- 解析唯一缓存：741
- 匹配到北京区域：545
- 未命中北京区域：196
- 点亮区域：65
- 完成率：19.46%

## 项目结构

```text
src/
  lib/
    gpx.ts        GPX 解析
    spatial.ts    点面匹配与统计
    types.ts      共享类型
  main.ts         界面与地图逻辑
  style.css       页面样式
tests/
  gpx.test.ts
  spatial.test.ts
  e2e.test.ts
scripts/
  prepare-data.ts  生成精简边界数据
  report.ts       输出真实数据统计
public/
  data/
```
