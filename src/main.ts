import 'leaflet/dist/leaflet.css';
import './style.css';

import L from 'leaflet';

import pocketQueryImage from '../pocket-query.png';

import { parseGpxXml } from './lib/gpx';
import { buildAdminFeatures, matchCachesToFeatures } from './lib/spatial';
import type { AdminFeature, DatasetLevel, MatchResult, ParseResult } from './lib/types';

const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('找不到应用挂载点。');
}

app.innerHTML = `
  <div class="shell">
    <header class="topbar">
      <div>
        <p class="eyebrow">Beijing Geocaching Find Map</p>
        <h1>北京 Geocaching 行政区 Find Map</h1>
      </div>
    </header>

    <main class="layout">
      <section class="panel controls">
        <div class="panel-header">
          <div class="panel-title">
            <h2>导入 GPX</h2>
            <button id="help-button" class="help-button" type="button" aria-label="如何获取 GPX 文件">?</button>
          </div>
        </div>
        <label id="dropzone" class="dropzone" for="file-input">
          <input id="file-input" type="file" accept=".gpx,application/gpx+xml,application/xml,text/xml" hidden />
          <strong>选择或拖入 My Finds Pocket Query <code>.gpx</code> 文件</strong>
          <span>文件只在浏览器本地处理，不上传。</span>
        </label>
        <p id="status-text" class="status-text" hidden></p>
        <div class="action-row">
          <button id="export-button" class="button button-secondary" disabled>导出 CSV</button>
          <button id="reset-button" class="button button-secondary">重置</button>
        </div>
        <div id="stats-grid" class="stats-grid"></div>
      </section>

      <section class="panel map-panel">
        <div class="panel-header">
          <h2>地图</h2>
          <div class="filters">
            <button data-level="district" class="level-button is-active">区级</button>
            <button data-level="township" class="level-button">乡镇级</button>
          </div>
        </div>
        <div id="map" class="map"></div>
      </section>

      <section class="panel sidebar">
        <div class="sidebar-block detail-block">
          <div class="panel-header">
            <h2>区域详情</h2>
            <span class="meta">点击地图或列表查看</span>
          </div>
          <div id="detail-panel" class="detail-panel empty">
            <p>还没有选中区域。</p>
          </div>
        </div>

        <div class="sidebar-block list-block">
          <div class="panel-header list-header">
            <h2>区域列表</h2>
          </div>
          <div class="list-controls">
            <input id="search-input" class="search-input" type="search" placeholder="搜索区域名称" />
            <div class="filters">
              <button data-filter="all" class="filter-button is-active">全部</button>
              <button data-filter="visited" class="filter-button">已访问</button>
              <button data-filter="unvisited" class="filter-button">未访问</button>
            </div>
          </div>
          <div id="area-list" class="area-list"></div>
        </div>
      </section>
    </main>
  </div>

  <div id="loading-overlay" class="overlay" hidden>
    <div class="overlay-card loading-card">
      <p id="loading-label" class="loading-label">正在处理…</p>
      <div class="loading-track">
        <div id="loading-bar" class="loading-bar"></div>
      </div>
    </div>
  </div>

  <div id="help-overlay" class="overlay" hidden>
    <div class="overlay-card help-card" role="dialog" aria-modal="true" aria-labelledby="help-title">
      <div class="help-header">
        <h2 id="help-title">如何获取 GPX 文件</h2>
        <button id="help-close" class="help-close" type="button" aria-label="关闭教程">×</button>
      </div>
      <ol class="help-steps">
        <li>
          访问 <a href="https://www.geocaching.com/pocket/" target="_blank" rel="noopener noreferrer">Geocaching Pocket Queries 页面</a>
        </li>
        <li>按照图示获取 Pocket Query：</li>
      </ol>
      <img class="help-image" src="${pocketQueryImage}" alt="Geocaching Pocket Queries 页面操作示意" />
    </div>
  </div>
`;

const VISITED_FILL = '#b55a39';
const UNVISITED_FILL = '#cfc9c1';
const BORDER_COLOR = '#6e655d';
const HOVER_COLOR = '#3a3430';

const fileInput = document.querySelector<HTMLInputElement>('#file-input')!;
const dropzone = document.querySelector<HTMLLabelElement>('#dropzone')!;
const statusText = document.querySelector<HTMLParagraphElement>('#status-text')!;
const statsGrid = document.querySelector<HTMLDivElement>('#stats-grid')!;
const detailPanel = document.querySelector<HTMLDivElement>('#detail-panel')!;
const areaList = document.querySelector<HTMLDivElement>('#area-list')!;
const searchInput = document.querySelector<HTMLInputElement>('#search-input')!;
const exportButton = document.querySelector<HTMLButtonElement>('#export-button')!;
const loadingOverlay = document.querySelector<HTMLDivElement>('#loading-overlay')!;
const loadingLabel = document.querySelector<HTMLParagraphElement>('#loading-label')!;
const loadingBar = document.querySelector<HTMLDivElement>('#loading-bar')!;
const helpButton = document.querySelector<HTMLButtonElement>('#help-button')!;
const helpOverlay = document.querySelector<HTMLDivElement>('#help-overlay')!;
const helpClose = document.querySelector<HTMLButtonElement>('#help-close')!;
const resetButton = document.querySelector<HTMLButtonElement>('#reset-button')!;
const filterButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.filter-button'));
const levelButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.level-button'));

const map = L.map('map', {
  zoomControl: false,
  attributionControl: false,
  preferCanvas: true,
});

L.control.zoom({ position: 'bottomright' }).addTo(map);

const DATASETS: Record<DatasetLevel, { path: string; label: string; unitLabel: string; level: number; note: string }> = {
  district: {
    path: '/data/beijing-districts.geojson',
    label: '区级',
    unitLabel: '区',
    level: 4,
    note: '16 个区，适合总览北京整体完成度。',
  },
  township: {
    path: '/data/beijing-townships.geojson',
    label: '乡镇级',
    unitLabel: '乡镇',
    level: 5,
    note: '334 个乡镇级单元，适合真正的挑战追踪。',
  },
};

let baseFeatures: AdminFeature[] = [];
let unitById = new Map<string, MatchResult['units'][number]>();
let geoJsonLayer: L.GeoJSON | null = null;
let parseResult: ParseResult | null = null;
let matchResult: MatchResult | null = null;
let selectedUnitId: string | null = null;
let activeFilter: 'all' | 'visited' | 'unvisited' = 'all';
let selectedLevel: DatasetLevel = 'district';
let expandedParentNames = new Set<string>();
const datasetCache = new Map<DatasetLevel, AdminFeature[]>();

function setStatus(message: string): void {
  statusText.textContent = message;
  statusText.hidden = message.trim().length === 0;
}

function nextFrame(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === 'function') {
      requestAnimationFrame(() => resolve());
      return;
    }
    resolve();
  });
}

function updateLoading(progress: number, label: string): void {
  loadingLabel.textContent = label;
  loadingBar.style.width = `${Math.round(Math.min(Math.max(progress, 0), 1) * 100)}%`;
}

function setLoading(visible: boolean, progress = 0, label = '正在处理…'): void {
  loadingOverlay.hidden = !visible;
  if (visible) updateLoading(progress, label);
}

async function withLoading<T>(label: string, task: () => Promise<T>): Promise<T> {
  setLoading(true, 0, label);
  // 解析与匹配都是同步重计算，先让遮罩绘制一帧再执行，否则大文件会看起来毫无反应。
  await nextFrame();
  try {
    return await task();
  } finally {
    setLoading(false);
  }
}

function currentDataset() {
  return DATASETS[selectedLevel];
}

function makeUnits(features: AdminFeature[]): Map<string, MatchResult['units'][number]> {
  return new Map(
    features.map((feature) => [
      feature.properties.id,
      {
        ...feature.properties,
        findCount: 0,
        found: false,
        cacheCodes: [],
      },
    ])
  );
}

function renderStats(): void {
  const unitLabel = currentDataset().unitLabel;

  if (!parseResult || !matchResult) {
    statsGrid.innerHTML = `
      <div class="stat-card"><span><i class="swatch visited"></i>已访问${unitLabel}</span><strong>—</strong><em>导入 GPX 后统计</em></div>
      <div class="stat-card"><span>匹配到北京</span><strong>—</strong><em>导入 GPX 后统计</em></div>
    `;
    return;
  }

  const { stats } = matchResult;
  statsGrid.innerHTML = `
    <div class="stat-card"><span><i class="swatch visited"></i>已访问${unitLabel}</span><strong>${stats.visitedUnits} / ${stats.totalUnits}</strong><em>完成率 ${stats.completionPercentage.toFixed(1)}%</em></div>
    <div class="stat-card"><span>匹配到北京</span><strong>${stats.matchedUniqueCaches}</strong><em>${stats.unmatchedUniqueCaches} 个未命中</em></div>
  `;
}

function getFeatureStyle(id: string): L.PathOptions {
  const unit = unitById.get(id);
  const isSelected = selectedUnitId === id;
  const found = Boolean(unit?.found);
  return {
    color: isSelected ? HOVER_COLOR : BORDER_COLOR,
    weight: isSelected ? 2.2 : 1.2,
    fillColor: found ? VISITED_FILL : UNVISITED_FILL,
    fillOpacity: found ? 0.82 : 0.78,
  };
}

function renderDetail(): void {
  if (!selectedUnitId || !matchResult) {
    detailPanel.className = 'detail-panel empty';
    detailPanel.innerHTML = '<p>还没有选中区域。</p>';
    return;
  }

  const unit = unitById.get(selectedUnitId);
  if (!unit) return;

  detailPanel.className = 'detail-panel';
  detailPanel.innerHTML = `
    <div class="detail-kicker">${unit.parentName}</div>
    <h3>${unit.name}</h3>
    <dl class="detail-grid">
      <div><dt>Find 数</dt><dd>${unit.findCount}</dd></div>
      <div><dt>状态</dt><dd>${unit.found ? '已访问' : '未访问'}</dd></div>
    </dl>
    <div class="detail-codes">
      <strong>命中的缓存代码</strong>
      <div class="detail-codes-box">
        ${
          unit.cacheCodes.length > 0
            ? `<div class="code-links">${unit.cacheCodes
                .map(
                  (code) =>
                    `<a href="https://www.geocaching.com/geocache/${code}" target="_blank" rel="noopener noreferrer">${code}</a>`
                )
                .join('')}</div>`
            : '<p>暂无</p>'
        }
      </div>
    </div>
  `;
}

function renderAreaList(): void {
  if (!matchResult) {
    areaList.innerHTML = '<p class="muted">导入 GPX 后会在这里显示区域完成情况。</p>';
    return;
  }

  const keyword = searchInput.value.trim();
  const items = matchResult.units
    .filter((unit) => {
      if (activeFilter === 'visited') return unit.found;
      if (activeFilter === 'unvisited') return !unit.found;
      return true;
    })
    .filter((unit) => (keyword ? unit.name.includes(keyword) || unit.parentName.includes(keyword) : true))
    .sort((left, right) => {
      if (activeFilter === 'unvisited') {
        return left.name.localeCompare(right.name, 'zh-Hans-CN');
      }
      return right.findCount - left.findCount || left.name.localeCompare(right.name, 'zh-Hans-CN');
    });

  const groups = new Map<string, typeof items>();
  items.forEach((unit) => {
    const bucket = groups.get(unit.parentName) ?? [];
    bucket.push(unit);
    groups.set(unit.parentName, bucket);
  });

  if (selectedLevel === 'district') {
    areaList.innerHTML = items
      .map(
        (unit) => `
          <button class="area-row ${selectedUnitId === unit.id ? 'is-active' : ''}" data-id="${unit.id}">
            <span class="area-name">${unit.name}</span>
            <span class="area-meta">${unit.found ? `已访问 · ${unit.findCount}` : '未访问'}</span>
          </button>
        `
      )
      .join('');

    areaList.querySelectorAll<HTMLButtonElement>('.area-row').forEach((button) => {
      button.addEventListener('click', () => {
        const id = button.dataset.id;
        if (!id) return;
        selectUnit(id, true);
      });
    });
    return;
  }

  areaList.innerHTML = Array.from(groups.entries())
    .sort((left, right) => {
      const leftVisited = left[1].filter((unit) => unit.found).length;
      const rightVisited = right[1].filter((unit) => unit.found).length;
      const leftFinds = left[1].reduce((sum, unit) => sum + unit.findCount, 0);
      const rightFinds = right[1].reduce((sum, unit) => sum + unit.findCount, 0);
      return rightVisited - leftVisited || rightFinds - leftFinds || left[0].localeCompare(right[0], 'zh-Hans-CN');
    })
    .map(
      ([parentName, units]) => `
        <section class="area-group ${expandedParentNames.has(parentName) ? 'is-open' : ''}" data-parent="${parentName}">
          <div class="area-group-header">
            <div class="area-group-summary">
              <span class="area-group-title">${parentName}</span>
              <span class="area-group-meta">${units.filter((unit) => unit.found).length}/${units.length}</span>
            </div>
            <button
              class="area-group-toggle ${expandedParentNames.has(parentName) ? 'is-open' : ''}"
              data-parent="${parentName}"
              aria-label="${expandedParentNames.has(parentName) ? '收起' : '展开'} ${parentName}"
              aria-expanded="${expandedParentNames.has(parentName) ? 'true' : 'false'}"
            >
              <span class="area-group-toggle-icon">${expandedParentNames.has(parentName) ? '−' : '+'}</span>
            </button>
          </div>
          <div class="area-group-children">
            ${units
              .map(
                (unit) => `
                  <button class="area-row ${selectedUnitId === unit.id ? 'is-active' : ''}" data-id="${unit.id}">
                    <span class="area-name">${unit.name}</span>
                    <span class="area-meta">${unit.found ? `已访问 · ${unit.findCount}` : '未访问'}</span>
                  </button>
                `
              )
              .join('')}
          </div>
        </section>
      `
    )
    .join('');

  areaList.querySelectorAll<HTMLButtonElement>('.area-group-toggle').forEach((button) => {
    button.addEventListener('click', () => {
      const parentName = button.dataset.parent;
      if (!parentName) return;
      if (expandedParentNames.has(parentName)) {
        expandedParentNames.delete(parentName);
      } else {
        expandedParentNames.add(parentName);
      }
      renderAreaList();
    });
  });

  areaList.querySelectorAll<HTMLButtonElement>('.area-row').forEach((button) => {
    button.addEventListener('click', () => {
      const id = button.dataset.id;
      if (!id) return;
      selectUnit(id, true);
    });
  });
}

function redrawLayer(): void {
  if (!geoJsonLayer) return;
  geoJsonLayer.eachLayer((layer) => {
    const target = layer as L.Path & { feature?: GeoJSON.Feature };
    const id = String(target.feature?.properties?.id ?? '');
    target.setStyle(getFeatureStyle(id));
  });
}

function selectUnit(id: string, fitBounds = false): void {
  selectedUnitId = id;
  const unit = unitById.get(id);
  if (unit) {
    // 仅在“选中”这个动作上自动展开所属区，之后仍可手动收起。
    expandedParentNames.add(unit.parentName);
  }
  renderDetail();
  renderAreaList();
  redrawLayer();

  if (fitBounds && geoJsonLayer) {
    geoJsonLayer.eachLayer((layer) => {
      const target = layer as L.Layer & { feature?: GeoJSON.Feature };
      if (String(target.feature?.properties?.id ?? '') === id && 'getBounds' in target) {
        map.fitBounds((target as L.Polygon).getBounds(), { padding: [36, 36], maxZoom: selectedLevel === 'district' ? 11 : 13 });
      }
    });
  }
}

function renderBoundaries(fitMap = true): void {
  if (geoJsonLayer) {
    geoJsonLayer.remove();
  }

  geoJsonLayer = L.geoJSON(baseFeatures as unknown as GeoJSON.FeatureCollection, {
    style: (feature) => getFeatureStyle(String(feature?.properties?.id ?? '')),
    onEachFeature: (feature, layer) => {
      const id = String(feature.properties?.id ?? '');
      layer.on({
        mouseover: () => {
          (layer as L.Path).setStyle({
            color: HOVER_COLOR,
            weight: 2,
          });
        },
        mouseout: () => {
          (layer as L.Path).setStyle(getFeatureStyle(id));
        },
        click: () => selectUnit(id),
      });
    },
  }).addTo(map);

  if (fitMap) {
    map.fitBounds(geoJsonLayer.getBounds(), { padding: [24, 24] });
  }
}

async function loadDataset(level: DatasetLevel): Promise<AdminFeature[]> {
  const cached = datasetCache.get(level);
  if (cached) return cached;

  const response = await fetch(DATASETS[level].path);
  if (!response.ok) {
    throw new Error('无法加载北京边界数据。');
  }
  const raw = (await response.json()) as GeoJSON.FeatureCollection;
  const features = buildAdminFeatures(raw, { level: DATASETS[level].level, parentName: level === 'district' ? '北京市' : undefined });
  datasetCache.set(level, features);
  return features;
}

async function applyDataset(level: DatasetLevel, fitMap = true): Promise<void> {
  selectedLevel = level;
  baseFeatures = await loadDataset(level);
  unitById = makeUnits(baseFeatures);
  selectedUnitId = null;
  expandedParentNames = new Set();
  levelButtons.forEach((button) => button.classList.toggle('is-active', button.dataset.level === level));
  renderBoundaries(fitMap);
  renderStats();
  renderDetail();
  renderAreaList();
}

async function runMatching(): Promise<void> {
  if (!parseResult?.summary.validGpx) return;

  const label = `正在匹配${currentDataset().label}边界`;
  updateLoading(0.08, `${label}…`);
  matchResult = await matchCachesToFeatures(parseResult.records, baseFeatures, (progress) => {
    updateLoading(0.08 + progress * 0.92, `${label}… ${Math.round(progress * 100)}%`);
  });
  unitById = new Map(matchResult.units.map((unit) => [unit.id, unit]));
  selectedUnitId = matchResult.units.find((unit) => unit.found)?.id ?? matchResult.units[0]?.id ?? null;
  expandedParentNames = new Set();
  redrawLayer();
  renderStats();
  renderDetail();
  renderAreaList();
  exportButton.disabled = false;
}

async function processXml(xml: string): Promise<void> {
  // 上一次导入留下的报错要在新文件开始处理时立刻清掉，否则导入成功后仍会残留。
  setStatus('');
  await withLoading('正在读取并解析 GPX 文件…', async () => {
    parseResult = parseGpxXml(xml);

    if (!parseResult.summary.validGpx) {
      matchResult = null;
      unitById = makeUnits(baseFeatures);
      redrawLayer();
      renderStats();
      renderDetail();
      renderAreaList();
      throw new Error(parseResult.summary.warnings[0] || 'GPX 解析失败。');
    }

    await runMatching();
  });
}

function exportCsv(): void {
  if (!matchResult) return;
  const header = ['id', 'name', 'parentName', 'findCount', 'status', 'cacheCodes'];
  const rows = matchResult.units.map((unit) => [
    unit.id,
    unit.name,
    unit.parentName,
    String(unit.findCount),
    unit.found ? 'visited' : 'unvisited',
    unit.cacheCodes.join('|'),
  ]);
  const csv = [header, ...rows]
    .map((row) => row.map((value) => `"${value.replaceAll('"', '""')}"`).join(','))
    .join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `beijing-find-map-${selectedLevel}-summary.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function resetState(): void {
  parseResult = null;
  matchResult = null;
  selectedUnitId = null;
  exportButton.disabled = true;
  unitById = makeUnits(baseFeatures);
  redrawLayer();
  renderStats();
  renderDetail();
  renderAreaList();
  setStatus('');
  fileInput.value = '';
}

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;
  try {
    await processXml(await file.text());
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '读取文件失败。');
  }
});

dropzone.addEventListener('dragover', (event) => {
  event.preventDefault();
  dropzone.classList.add('is-dragging');
});

dropzone.addEventListener('dragleave', () => {
  dropzone.classList.remove('is-dragging');
});

dropzone.addEventListener('drop', async (event) => {
  event.preventDefault();
  dropzone.classList.remove('is-dragging');
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  try {
    await processXml(await file.text());
  } catch (error) {
    setStatus(error instanceof Error ? error.message : '拖拽文件读取失败。');
  }
});

exportButton.addEventListener('click', exportCsv);
resetButton.addEventListener('click', resetState);
searchInput.addEventListener('input', renderAreaList);

helpButton.addEventListener('click', () => {
  helpOverlay.hidden = false;
});
helpClose.addEventListener('click', () => {
  helpOverlay.hidden = true;
});
helpOverlay.addEventListener('click', (event) => {
  if (event.target === helpOverlay) helpOverlay.hidden = true;
});
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !helpOverlay.hidden) helpOverlay.hidden = true;
});

filterButtons.forEach((button) => {
  button.addEventListener('click', () => {
    activeFilter = button.dataset.filter as typeof activeFilter;
    filterButtons.forEach((item) => item.classList.toggle('is-active', item === button));
    renderAreaList();
  });
});

levelButtons.forEach((button) => {
  button.addEventListener('click', async () => {
    const nextLevel = button.dataset.level as DatasetLevel;
    if (nextLevel === selectedLevel) return;
    try {
      await withLoading(`正在切换到${DATASETS[nextLevel].label}视图…`, async () => {
        await applyDataset(nextLevel, true);
        if (parseResult?.summary.validGpx) {
          await runMatching();
        }
      });
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '切换层级失败。');
    }
  });
});

applyDataset('district').catch((error) => {
  setStatus(error instanceof Error ? error.message : '边界加载失败。');
});
