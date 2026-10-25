import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

type RawFeatureCollection = GeoJSON.FeatureCollection<GeoJSON.Geometry, Record<string, unknown>>;

function roundCoordinates(value: unknown): unknown {
  if (typeof value === 'number') {
    return Number(value.toFixed(6));
  }
  if (Array.isArray(value)) {
    return value.map(roundCoordinates);
  }
  return value;
}

function writeJson(path: string, value: unknown): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(value));
}

function main(): void {
  const root = process.cwd();
  const districtNames = JSON.parse(readFileSync(join(root, 'area/province/110000.json'), 'utf8')) as Array<{ id: string; name: string }>;
  const districtNameMap = Object.fromEntries(districtNames.map((item) => [item.id, item.name]));

  const districtRaw = JSON.parse(
    readFileSync(join(root, '全国省市县边界GEOJson数据(不含乡镇街道)(边界数据未压缩)/map/province/110000.json'), 'utf8')
  ) as RawFeatureCollection;

  const townshipRaw = JSON.parse(
    readFileSync(join(root, '110100_110100_批量下载/乡镇/乡镇边界_110100.geojson'), 'utf8')
  ) as RawFeatureCollection;

  const districtOut: RawFeatureCollection = {
    type: 'FeatureCollection',
    features: districtRaw.features.map((feature) => ({
      type: 'Feature',
      geometry: roundCoordinates(feature.geometry) as GeoJSON.Geometry,
      properties: {
        id: String(feature.properties?.id ?? ''),
        code: String(feature.properties?.id ?? ''),
        name: String(feature.properties?.name ?? ''),
        level: 4,
        parentCode: '110000',
        parentName: '北京市',
      },
    })),
  };

  const townshipOut: RawFeatureCollection = {
    type: 'FeatureCollection',
    features: townshipRaw.features.map((feature) => {
      const code = String(feature.properties?.code ?? '');
      const parentCode = code.slice(0, 6);
      return {
        type: 'Feature',
        geometry: roundCoordinates(feature.geometry) as GeoJSON.Geometry,
        properties: {
          id: code.slice(0, 9),
          code,
          name: String(feature.properties?.name ?? ''),
          level: 5,
          parentCode,
          parentName: districtNameMap[parentCode] ?? '北京市',
        },
      };
    }),
  };

  writeJson(join(root, 'public/data/beijing-districts.geojson'), districtOut);
  writeJson(join(root, 'public/data/beijing-townships.geojson'), townshipOut);
}

main();
