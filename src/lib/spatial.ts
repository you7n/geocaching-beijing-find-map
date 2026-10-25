import booleanPointInPolygon from '@turf/boolean-point-in-polygon';
import { point } from '@turf/helpers';

import type { AdminFeature, CacheRecord, MatchResult } from './types';

export function buildAdminFeatures(raw: GeoJSON.FeatureCollection, defaults?: { level?: number; parentName?: string; parentCode?: string }): AdminFeature[] {
  return raw.features
    .filter((feature): feature is GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon> => {
      return Boolean(
        feature.geometry &&
          (feature.geometry.type === 'Polygon' || feature.geometry.type === 'MultiPolygon') &&
          feature.properties?.id &&
          feature.properties?.name
      );
    })
    .map((feature) => ({
      type: 'Feature',
      geometry: feature.geometry,
      properties: {
        id: String(feature.properties!.id),
        code: feature.properties!.code ? String(feature.properties!.code) : String(feature.properties!.id),
        name: String(feature.properties!.name),
        level: Number(feature.properties!.level ?? defaults?.level ?? 4),
        parentCode: feature.properties!.parentCode ? String(feature.properties!.parentCode) : defaults?.parentCode,
        parentName: feature.properties!.parentName ? String(feature.properties!.parentName) : defaults?.parentName ?? '北京市',
      },
    }));
}

export async function matchCachesToFeatures(
  records: CacheRecord[],
  features: AdminFeature[],
  onProgress?: (progress: number) => void
): Promise<MatchResult> {
  const featureMap = new Map(
    features.map((feature) => [
      feature.properties.id,
      {
        ...feature.properties,
        findCount: 0,
        found: false,
        cacheCodes: [] as string[],
      },
    ])
  );

  const matchedCodes = new Set<string>();
  const unmatchedCodes: string[] = [];

  for (let index = 0; index < records.length; index += 1) {
    const record = records[index];
    const targetPoint = point([record.longitude, record.latitude]);
    let matchedFeature: AdminFeature | null = null;

    for (const feature of features) {
      if (booleanPointInPolygon(targetPoint, feature as GeoJSON.Feature<GeoJSON.Polygon | GeoJSON.MultiPolygon>, { ignoreBoundary: false })) {
        matchedFeature = feature;
        break;
      }
    }

    if (matchedFeature) {
      matchedCodes.add(record.code);
      const unit = featureMap.get(matchedFeature.properties.id)!;
      if (!unit.cacheCodes.includes(record.code)) {
        unit.cacheCodes.push(record.code);
        unit.findCount += 1;
        unit.found = true;
      }
    } else {
      unmatchedCodes.push(record.code);
    }

    if ((index + 1) % 100 === 0) {
      onProgress?.((index + 1) / records.length);
      await new Promise((resolve) => {
        if (typeof requestAnimationFrame === 'function') {
          requestAnimationFrame(() => resolve(undefined));
          return;
        }
        resolve(undefined);
      });
    }
  }

  const units = Array.from(featureMap.values()).sort((left, right) => left.name.localeCompare(right.name, 'zh-Hans-CN'));
  const visitedUnits = units.filter((unit) => unit.found).length;
  const totalUnits = units.length;

  onProgress?.(1);

  return {
    stats: {
      totalUnits,
      visitedUnits,
      unvisitedUnits: totalUnits - visitedUnits,
      completionPercentage: totalUnits === 0 ? 0 : (visitedUnits / totalUnits) * 100,
      matchedUniqueCaches: matchedCodes.size,
      unmatchedUniqueCaches: unmatchedCodes.length,
    },
    units,
    unmatchedCodes,
  };
}
