import type { CacheRecord, ParseResult } from './types';

type ParserLike = {
  parseFromString(input: string, mimeType: string): Document;
};

const XML_ERROR_NS = 'http://www.mozilla.org/newlayout/xml/parsererror.xml';
const EXPECTED_DOCUMENT_NAME = 'My Finds Pocket Query';

function getChildrenByLocalName(parent: ParentNode, localName: string): Element[] {
  const out: Element[] = [];
  const walker = (node: ParentNode) => {
    for (const child of Array.from(node.childNodes)) {
      if (child.nodeType !== 1) continue;
      const element = child as Element;
      if (element.localName === localName) out.push(element);
      walker(element);
    }
  };
  walker(parent);
  return out;
}

function getFirstText(parent: ParentNode, localName: string): string | null {
  const element = getChildrenByLocalName(parent, localName)[0];
  return element?.textContent?.trim() || null;
}

function getDirectChild(parent: Element, localName: string): Element | null {
  for (const child of Array.from(parent.childNodes)) {
    if (child.nodeType === 1 && (child as Element).localName === localName) {
      return child as Element;
    }
  }
  return null;
}

function getDocumentName(root: Element): string | null {
  const direct = getDirectChild(root, 'name');
  if (direct) return direct.textContent?.trim() || null;
  const metadata = getDirectChild(root, 'metadata');
  return metadata ? getFirstText(metadata, 'name') : null;
}

function invalidResult(message: string): ParseResult {
  return {
    records: [],
    summary: {
      validGpx: false,
      totalWaypoints: 0,
      cacheWaypoints: 0,
      parsedRecords: 0,
      uniqueCaches: 0,
      duplicateCount: 0,
      skippedAuxiliary: 0,
      skippedInvalid: 0,
      warnings: [message],
    },
  };
}

function getCacheLogs(cacheElement: Element): string[] {
  const logs = getChildrenByLocalName(cacheElement, 'log');
  return logs
    .map((log) => getFirstText(log, 'type'))
    .filter((value): value is string => Boolean(value));
}

function isFindLike(sym: string | null, logTypes: string[]): boolean {
  if (sym === 'Geocache Found') return true;
  return logTypes.some((type) => type === 'Found it' || type === 'Attended');
}

export function parseGpxXml(xml: string, parser: ParserLike = new DOMParser()): ParseResult {
  const doc = parser.parseFromString(xml, 'application/xml');
  const parseErrors = doc.getElementsByTagName('parsererror').length > 0 || doc.getElementsByTagNameNS(XML_ERROR_NS, 'parsererror').length > 0;
  if (parseErrors || doc.documentElement.localName !== 'gpx') {
    return invalidResult('文件不是有效的 GPX XML。');
  }

  const documentName = getDocumentName(doc.documentElement);
  if (documentName !== EXPECTED_DOCUMENT_NAME) {
    return invalidResult(
      `这不是 My Finds Pocket Query 文件。请在 geocaching.com 的 Pocket Query 页面下载 “My Finds” 查询后重新导入。`
    );
  }

  const warnings: string[] = [];
  const waypoints = getChildrenByLocalName(doc.documentElement, 'wpt');
  const uniqueCodes = new Set<string>();
  const records: CacheRecord[] = [];

  let cacheWaypoints = 0;
  let duplicateCount = 0;
  let skippedAuxiliary = 0;
  let skippedInvalid = 0;

  for (const waypoint of waypoints) {
    const cacheElement = getChildrenByLocalName(waypoint, 'cache')[0];
    if (!cacheElement) {
      skippedAuxiliary += 1;
      continue;
    }

    cacheWaypoints += 1;
    const lat = Number(waypoint.getAttribute('lat'));
    const lon = Number(waypoint.getAttribute('lon'));
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
      skippedInvalid += 1;
      continue;
    }

    const code = getFirstText(waypoint, 'name');
    if (!code || !/^GC[A-Z0-9]+$/i.test(code)) {
      skippedInvalid += 1;
      continue;
    }

    const sym = getFirstText(waypoint, 'sym');
    const cacheType = getFirstText(cacheElement, 'type') || 'Unknown Cache';
    const logTypes = getCacheLogs(cacheElement);
    if (!isFindLike(sym, logTypes)) {
      skippedAuxiliary += 1;
      continue;
    }

    if (uniqueCodes.has(code)) {
      duplicateCount += 1;
      continue;
    }

    uniqueCodes.add(code);
    records.push({
      code,
      name: getFirstText(cacheElement, 'name') || code,
      cacheId: cacheElement.getAttribute('id'),
      cacheType,
      latitude: lat,
      longitude: lon,
      sym,
      logTypes,
    });
  }

  if (cacheWaypoints !== waypoints.length) {
    warnings.push(`跳过了 ${waypoints.length - cacheWaypoints} 个不含缓存主体的航点。`);
  }

  const attendedOnly = records.filter((record) => record.logTypes.includes('Attended') && !record.logTypes.includes('Found it')).length;
  if (attendedOnly > 0) {
    warnings.push(`发现 ${attendedOnly} 个活动缓存记录仅包含 Attended 日志，仍按已完成记录处理。`);
  }

  return {
    records,
    summary: {
      validGpx: true,
      totalWaypoints: waypoints.length,
      cacheWaypoints,
      parsedRecords: records.length,
      uniqueCaches: records.length,
      duplicateCount,
      skippedAuxiliary,
      skippedInvalid,
      warnings,
    },
  };
}
