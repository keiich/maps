import raw from '@/data/official-crime.json';

import type { OfficialArea, OfficialDataset } from './types';

export interface CrimeType {
  key: string;
  label: string;
}

export interface OfficialAreaWithRate extends OfficialArea {
  /** 人口10万人あたりの認知件数。人口規模の違いを均して比較するための指標。 */
  ratePer100k: number;
}

export interface OfficialPayload extends Omit<OfficialDataset, 'areas'> {
  crimeTypes: CrimeType[];
  areas: OfficialAreaWithRate[];
  /** 全域での ratePer100k の範囲。凡例と色分けのスケールに使う。 */
  rateRange: { min: number; max: number };
}

const dataset = raw as unknown as OfficialDataset & { crimeTypes: CrimeType[] };

let cached: OfficialPayload | null = null;

/** 公式統計データセットを、人口比の指標付きで返す。 */
export function getOfficialData(): OfficialPayload {
  if (cached) return cached;

  const areas: OfficialAreaWithRate[] = dataset.areas.map((area) => ({
    ...area,
    ratePer100k:
      area.population > 0 ? Math.round((area.total / area.population) * 100000) : 0,
  }));

  const rates = areas.map((a) => a.ratePer100k);
  cached = {
    dataStatus: dataset.dataStatus,
    period: dataset.period,
    sourceName: dataset.sourceName,
    sourceUrl: dataset.sourceUrl,
    license: dataset.license,
    retrievedAt: dataset.retrievedAt,
    crimeTypes: dataset.crimeTypes ?? [],
    areas,
    rateRange: {
      min: rates.length ? Math.min(...rates) : 0,
      max: rates.length ? Math.max(...rates) : 0,
    },
  };
  return cached;
}
