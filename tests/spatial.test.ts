import { describe, expect, it } from 'vitest';

import { matchCachesToFeatures } from '../src/lib/spatial';
import type { AdminFeature, CacheRecord } from '../src/lib/types';

const features: AdminFeature[] = [
  {
    type: 'Feature',
    geometry: {
      type: 'Polygon',
      coordinates: [[[0, 0], [0, 10], [10, 10], [10, 0], [0, 0]]],
    },
    properties: { id: 'A', name: '甲区', level: 4, parentName: '北京市' },
  },
  {
    type: 'Feature',
    geometry: {
      type: 'MultiPolygon',
      coordinates: [
        [[[20, 0], [20, 5], [25, 5], [25, 0], [20, 0]]],
        [[[20, 10], [20, 15], [25, 15], [25, 10], [20, 10]]],
      ],
    },
    properties: { id: 'B', name: '乙区', level: 4, parentName: '北京市' },
  },
];

function record(code: string, longitude: number, latitude: number): CacheRecord {
  return {
    code,
    name: code,
    cacheId: code,
    cacheType: 'Traditional Cache',
    latitude,
    longitude,
    sym: 'Geocache Found',
    logTypes: ['Found it'],
  };
}

describe('matchCachesToFeatures', () => {
  it('区内点会点亮对应区域', async () => {
    const result = await matchCachesToFeatures([record('GC1', 5, 5)], features);
    expect(result.stats.visitedUnits).toBe(1);
    expect(result.units.find((unit) => unit.id === 'A')?.found).toBe(true);
  });

  it('同一区多个缓存只贡献一个 visited unit', async () => {
    const result = await matchCachesToFeatures([record('GC1', 5, 5), record('GC2', 6, 6)], features);
    expect(result.stats.visitedUnits).toBe(1);
    expect(result.units.find((unit) => unit.id === 'A')?.findCount).toBe(2);
  });

  it('区外点不会匹配到北京区域', async () => {
    const result = await matchCachesToFeatures([record('GC1', 50, 50)], features);
    expect(result.stats.matchedUniqueCaches).toBe(0);
    expect(result.unmatchedCodes).toEqual(['GC1']);
  });

  it('MultiPolygon 区域可以正确匹配', async () => {
    const result = await matchCachesToFeatures([record('GC1', 22, 12)], features);
    expect(result.units.find((unit) => unit.id === 'B')?.found).toBe(true);
  });

  it('边界点按命中处理', async () => {
    const result = await matchCachesToFeatures([record('GC1', 0, 5)], features);
    expect(result.units.find((unit) => unit.id === 'A')?.found).toBe(true);
  });

  it('重复缓存代码不会在同一区重复计数', async () => {
    const result = await matchCachesToFeatures([record('GC1', 5, 5), record('GC1', 5, 5)], features);
    expect(result.units.find((unit) => unit.id === 'A')?.findCount).toBe(1);
  });

  it('完成率按行政单元数量计算', async () => {
    const result = await matchCachesToFeatures([record('GC1', 5, 5)], features);
    expect(result.stats.totalUnits).toBe(2);
    expect(result.stats.completionPercentage).toBe(50);
  });
});
