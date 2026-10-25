import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';

import { parseGpxXml } from '../src/lib/gpx';
import { buildAdminFeatures, matchCachesToFeatures } from '../src/lib/spatial';

// 个人 GPX 含 GC 代码与坐标，未纳入版本库，缺失时自动跳过这组端到端用例。
const gpxPath = join(process.cwd(), '26075397.gpx');
const hasGpx = existsSync(gpxPath);

describe('provided data end-to-end', () => {
  it.skipIf(!hasGpx)('uses the supplied GPX and district dataset coherently', async () => {
    const root = process.cwd();
    const gpx = readFileSync(gpxPath, 'utf8');
    const districts = JSON.parse(readFileSync(join(root, 'public/data/beijing-districts.geojson'), 'utf8')) as GeoJSON.FeatureCollection;

    const parseResult = parseGpxXml(gpx, new DOMParser());
    const features = buildAdminFeatures(districts);
    const matchResult = await matchCachesToFeatures(parseResult.records, features);

    expect(parseResult.summary.validGpx).toBe(true);
    expect(features).toHaveLength(16);
    expect(parseResult.summary.uniqueCaches).toBe(741);
    expect(matchResult.stats.matchedUniqueCaches).toBeGreaterThan(0);
    expect(matchResult.stats.visitedUnits).toBeGreaterThan(0);
  });

  it.skipIf(!hasGpx)('uses the supplied GPX and township dataset coherently', async () => {
    const root = process.cwd();
    const gpx = readFileSync(gpxPath, 'utf8');
    const townships = JSON.parse(readFileSync(join(root, 'public/data/beijing-townships.geojson'), 'utf8')) as GeoJSON.FeatureCollection;

    const parseResult = parseGpxXml(gpx, new DOMParser());
    const features = buildAdminFeatures(townships);
    const matchResult = await matchCachesToFeatures(parseResult.records, features);

    expect(parseResult.summary.validGpx).toBe(true);
    expect(features).toHaveLength(334);
    expect(matchResult.stats.matchedUniqueCaches).toBeGreaterThan(0);
    expect(matchResult.stats.visitedUnits).toBeGreaterThan(0);
  });
});
