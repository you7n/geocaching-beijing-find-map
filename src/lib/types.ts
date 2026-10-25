export interface CacheRecord {
  code: string;
  name: string;
  cacheId: string | null;
  cacheType: string;
  latitude: number;
  longitude: number;
  sym: string | null;
  logTypes: string[];
}

export interface ParseSummary {
  validGpx: boolean;
  totalWaypoints: number;
  cacheWaypoints: number;
  parsedRecords: number;
  uniqueCaches: number;
  duplicateCount: number;
  skippedAuxiliary: number;
  skippedInvalid: number;
  warnings: string[];
}

export interface ParseResult {
  records: CacheRecord[];
  summary: ParseSummary;
}

export interface AdminProperties {
  id: string;
  code?: string;
  name: string;
  level: number;
  parentCode?: string;
  parentName: string;
}

export type DatasetLevel = 'district' | 'township';

export interface AdminFeature {
  type: 'Feature';
  geometry: GeoJSON.Polygon | GeoJSON.MultiPolygon;
  properties: AdminProperties;
}

export interface MatchResult {
  stats: {
    totalUnits: number;
    visitedUnits: number;
    unvisitedUnits: number;
    completionPercentage: number;
    matchedUniqueCaches: number;
    unmatchedUniqueCaches: number;
  };
  units: Array<AdminFeature['properties'] & { findCount: number; found: boolean; cacheCodes: string[] }>;
  unmatchedCodes: string[];
}
