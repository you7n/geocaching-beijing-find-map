import { describe, expect, it } from 'vitest';
import { DOMParser } from '@xmldom/xmldom';

import { parseGpxXml } from '../src/lib/gpx';

function wrapGpx(inner: string, name = 'My Finds Pocket Query'): string {
  return `<?xml version="1.0" encoding="utf-8"?>
  <gpx version="1.0" creator="test" xmlns="http://www.topografix.com/GPX/1/0">
    <name>${name}</name>
    ${inner}
  </gpx>`;
}

function cacheWpt({
  code,
  lat = '39.90',
  lon = '116.40',
  logs = '<groundspeak:log id="1"><groundspeak:type>Found it</groundspeak:type><groundspeak:finder id="1">you7n</groundspeak:finder></groundspeak:log>',
  sym = 'Geocache Found',
}: {
  code: string;
  lat?: string;
  lon?: string;
  logs?: string;
  sym?: string;
}): string {
  return `
    <wpt lat="${lat}" lon="${lon}">
      <name>${code}</name>
      <sym>${sym}</sym>
      <type>Geocache|Traditional Cache</type>
      <groundspeak:cache id="${code}" xmlns:groundspeak="http://www.groundspeak.com/cache/1/0">
        <groundspeak:name>${code}</groundspeak:name>
        <groundspeak:type>Traditional Cache</groundspeak:type>
        <groundspeak:logs>${logs}</groundspeak:logs>
      </groundspeak:cache>
    </wpt>
  `;
}

describe('parseGpxXml', () => {
  const parser = new DOMParser();

  it('解析有效缓存记录', () => {
    const result = parseGpxXml(wrapGpx(cacheWpt({ code: 'GC12345' })), parser);
    expect(result.summary.validGpx).toBe(true);
    expect(result.records).toHaveLength(1);
    expect(result.records[0].code).toBe('GC12345');
  });

  it('忽略没有 groundspeak:cache 的辅助航点', () => {
    const xml = wrapGpx(`
      <wpt lat="39.90" lon="116.40"><name>PK</name><sym>Parking Area</sym></wpt>
      ${cacheWpt({ code: 'GC12345' })}
    `);
    const result = parseGpxXml(xml, parser);
    expect(result.records).toHaveLength(1);
    expect(result.summary.skippedAuxiliary).toBe(1);
  });

  it('处理缺失坐标的记录', () => {
    const xml = wrapGpx(cacheWpt({ code: 'GC12345', lon: 'NaN' }));
    const result = parseGpxXml(xml, parser);
    expect(result.records).toHaveLength(0);
    expect(result.summary.skippedInvalid).toBe(1);
  });

  it('按 GC code 去重', () => {
    const xml = wrapGpx(`
      ${cacheWpt({ code: 'GC12345' })}
      ${cacheWpt({ code: 'GC12345', lat: '39.91' })}
    `);
    const result = parseGpxXml(xml, parser);
    expect(result.records).toHaveLength(1);
    expect(result.summary.duplicateCount).toBe(1);
  });

  it('接受只有 Attended 日志的活动缓存', () => {
    const xml = wrapGpx(
      cacheWpt({
        code: 'GCEVENT1',
        logs: '<groundspeak:log id="2"><groundspeak:type>Attended</groundspeak:type><groundspeak:finder id="1">you7n</groundspeak:finder></groundspeak:log>',
      })
    );
    const result = parseGpxXml(xml, parser);
    expect(result.records).toHaveLength(1);
    expect(result.summary.warnings.some((warning) => warning.includes('Attended'))).toBe(true);
  });

  it('空 GPX 输入返回可理解的统计', () => {
    const result = parseGpxXml(wrapGpx(''), parser);
    expect(result.summary.validGpx).toBe(true);
    expect(result.records).toHaveLength(0);
    expect(result.summary.totalWaypoints).toBe(0);
  });

  it('接受 name 为 My Finds Pocket Query 的文件', () => {
    const result = parseGpxXml(wrapGpx(cacheWpt({ code: 'GC12345' })), parser);
    expect(result.summary.validGpx).toBe(true);
    expect(result.records).toHaveLength(1);
  });

  it('拒绝 name 不是 My Finds Pocket Query 的文件', () => {
    const xml = wrapGpx(cacheWpt({ code: 'GC12345' }), 'List of favorite caches in Beijing');
    const result = parseGpxXml(xml, parser);
    expect(result.summary.validGpx).toBe(false);
    expect(result.records).toHaveLength(0);
    expect(result.summary.uniqueCaches).toBe(0);
    expect(result.summary.warnings[0]).toContain('My Finds Pocket Query');
  });

  it('拒绝缺少 name 的 GPX 文件', () => {
    const xml = `<?xml version="1.0" encoding="utf-8"?>
    <gpx version="1.0" creator="test" xmlns="http://www.topografix.com/GPX/1/0">${cacheWpt({ code: 'GC12345' })}</gpx>`;
    const result = parseGpxXml(xml, parser);
    expect(result.summary.validGpx).toBe(false);
    expect(result.records).toHaveLength(0);
    expect(result.summary.warnings[0]).toContain('My Finds Pocket Query');
  });
});
