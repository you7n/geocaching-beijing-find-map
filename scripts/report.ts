import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { DOMParser } from '@xmldom/xmldom';

import { parseGpxXml } from '../src/lib/gpx';
import { buildAdminFeatures, matchCachesToFeatures } from '../src/lib/spatial';

async function main(): Promise<void> {
  const root = process.cwd();
  const gpxPath = process.argv[2] ?? '26075397.gpx';

  if (!existsSync(join(root, gpxPath))) {
    console.error(`找不到 GPX 文件：${gpxPath}`);
    console.error('用法：npm run report -- /path/to/MyFinds.gpx');
    process.exitCode = 1;
    return;
  }

  const gpx = readFileSync(join(root, gpxPath), 'utf8');
  const parseResult = parseGpxXml(gpx, new DOMParser());
  const datasets = {
    district: 'public/data/beijing-districts.geojson',
    township: 'public/data/beijing-townships.geojson',
  } as const;

  const results: Record<string, unknown> = {};

  for (const [key, path] of Object.entries(datasets)) {
    const dataset = JSON.parse(readFileSync(join(root, path), 'utf8')) as GeoJSON.FeatureCollection;
    const features = buildAdminFeatures(dataset);
    const matchResult = await matchCachesToFeatures(parseResult.records, features);
    results[key] = {
      selectedDatasetPath: path,
      selectedDatasetFeatures: features.length,
      matchedUniqueCaches: matchResult.stats.matchedUniqueCaches,
      unmatchedUniqueCaches: matchResult.stats.unmatchedUniqueCaches,
      visitedUnits: matchResult.stats.visitedUnits,
      unvisitedUnits: matchResult.stats.unvisitedUnits,
      completionPercentage: Number(matchResult.stats.completionPercentage.toFixed(2)),
      visitedNames: matchResult.units.filter((unit) => unit.found).map((unit) => unit.name),
    };
  }

  const output = {
    parsedUniqueCaches: parseResult.summary.uniqueCaches,
    parsedRecords: parseResult.summary.parsedRecords,
    skippedAuxiliary: parseResult.summary.skippedAuxiliary,
    skippedInvalid: parseResult.summary.skippedInvalid,
    duplicateCount: parseResult.summary.duplicateCount,
    datasets: results,
    warnings: parseResult.summary.warnings,
  };

  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
