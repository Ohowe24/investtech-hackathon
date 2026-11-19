// Outlook engine reality check: do the signals mean anything? Two tests, published data only.
//   1. Momentum backtest: across every detailed StatCan industry and every year since 2001, did an industry's growth over
//      the past 3 years tell you its growth over the next 3? (Spearman rank correlation per year, and how often shrinking
//      industries kept lagging the economy, against the base rate.)
//   2. Company check: in the years each company reports organic growth (after inflation), did it move with its industry?
// Copies values and runs the formulas in engine/metrics.ts. Never creates a number.

import { existsSync, readFileSync } from "node:fs";
import type { OutlookReality } from "../../contract/outlook";
import { parseCsv } from "../csv";
import { correlationStrength, demean, median, pctChange, pearson, persistence, realGrowth, spearman, trailingMomentum, yearlyMeans } from "../metrics";

interface Point {
  refPer: string;
  value: number | null;
}
type SeriesFile = { series: Record<string, { coordinate: string; vectorDataPoint: Point[] }> };

const read = (p: string) => readFileSync(p, "utf8");
const need = (p: string) => {
  if (!existsSync(p)) throw new Error(`${p} is missing: run \`npm run outlook:fetch\` first`);
  return p;
};
const monthLabel = (refPer: string) =>
  new Date(refPer + "T00:00:00Z").toLocaleString("en-CA", { month: "short", year: "numeric", timeZone: "UTC" });

export function realityCheck(opts: {
  /** StatCan classification code -> member name */
  statcanName: Map<string, string>;
  /** StatCan member id of each classification code, to check every stored series is the industry it is filed under */
  statcanMember: Map<string, number>;
  /** our NAICS code -> StatCan code (outlook-industry-map.csv) */
  statcanOf: Map<string, string>;
  /** StatCan codes that stand for an industry or market one of the five companies is in, highlighted on the chart */
  highlight: Set<string>;
  years: number;
}): OutlookReality {
  const history = JSON.parse(read(need("engine/raw/outlook/statcan-36100434-history.json"))) as SeriesFile;
  for (const [code, s] of Object.entries(history.series)) {
    if (Number(s.coordinate.split(".")[3]) !== opts.statcanMember.get(code))
      throw new Error(`StatCan history filed under ${code} is another industry: re-run npm run outlook:fetch -- --fresh`);
  }
  const sorted = (pts: Point[]) => [...pts].sort((a, b) => a.refPer.localeCompare(b.refPer));
  const months = sorted(history.series.T001.vectorDataPoint).map((p) => p.refPer);
  const valuesOf = (code: string) => {
    const byMonth = new Map(history.series[code].vectorDataPoint.map((p) => [p.refPer, p.value]));
    return months.map((m) => byMonth.get(m) ?? null);
  };
  const codes = Object.keys(history.series).filter((c) => c !== "T001");
  const values = new Map(codes.map((c) => [c, valuesOf(c)]));
  const economy = valuesOf("T001");

  // ---------- 1. momentum backtest, one anchor per August with 4 years behind and 3 years ahead
  const Y = opts.years;
  const window = 12 * (Y + 1);
  const past = (v: (number | null)[], a: number) => trailingMomentum(v.slice(a - window + 1, a + 1), Y);
  const next = (v: (number | null)[], a: number) => trailingMomentum(v.slice(a - 11, a + 12 * Y + 1), Y);
  const anchors = months.map((m, i) => ({ m, i })).filter(({ m, i }) => m.slice(5, 7) === "08" && i - window + 1 >= 0 && i + 12 * Y < months.length);

  const rows: { past: number | null; next: number | null; econPast: number | null; econNext: number | null }[] = [];
  const perAnchor = anchors.map(({ m, i }) => {
    const xs = codes.map((c) => past(values.get(c)!, i));
    const ys = codes.map((c) => next(values.get(c)!, i));
    const econPast = past(economy, i);
    const econNext = next(economy, i);
    xs.forEach((x, k) => rows.push({ past: x, next: ys[k], econPast, econNext }));
    return { anchor: m, label: monthLabel(m), year: Number(m.slice(0, 4)), spearman: spearman(xs, ys), n: xs.filter((x, k) => x != null && ys[k] != null).length, xs, ys };
  });
  const last = perAnchor[perAnchor.length - 1];
  const p = persistence(rows);
  const medianSpearman = median(perAnchor.map((a) => a.spearman));

  // ---------- 2. company check: organic growth after inflation vs its industry's real GDP growth, by calendar year
  const cpiFile = JSON.parse(read(need("engine/raw/outlook/statcan-18100005-cpi.json"))) as { series: { vectorDataPoint: Point[] } };
  const cpi = new Map(cpiFile.series.vectorDataPoint.map((pt) => [Number(pt.refPer.slice(0, 4)), pt.value]));
  const inflation = (y: number) => pctChange(cpi.get(y - 1), cpi.get(y));

  const companies = parseCsv(read("engine/input/outlook-organic.csv")).map((r) => {
    const statcan = opts.statcanOf.get(r.naics);
    if (!statcan || !history.series[statcan]) throw new Error(`outlook-organic.csv: no StatCan history for ${r.naics}`);
    const ym = yearlyMeans(sorted(history.series[statcan].vectorDataPoint).map((pt) => ({ period: pt.refPer, value: pt.value })));
    const seg = JSON.parse(read(need(`engine/raw/segments/${r.ticker}.json`))) as {
      data: { data: { periodType: string; reportDate: string; metricsValues: Record<string, number | null> }[] };
    };
    const organic = new Map(
      seg.data.data
        .filter((d) => d.periodType === "Annual" && typeof d.metricsValues[r.metric_id] === "number")
        .map((d) => [Number(d.reportDate.slice(0, 4)), (d.metricsValues[r.metric_id] as number) / 100]),
    );
    const years = [...organic.keys()].sort((a, b) => a - b);
    const points = years.map((y) => ({
      year: y,
      organic: organic.get(y) ?? null,
      inflation: inflation(y),
      organicReal: realGrowth(organic.get(y), inflation(y) ?? NaN),
      industry: pctChange(ym[y - 1], ym[y]),
    }));
    const r2 = pearson(points.map((x) => x.industry), points.map((x) => x.organicReal));
    return {
      ticker: r.ticker,
      naics: r.naics,
      industry: `${opts.statcanName.get(statcan) ?? statcan} [${statcan}]`,
      note: r.note || null,
      points,
      correlation: r2,
      strength: correlationStrength(r2),
      n: points.filter((x) => x.industry != null && x.organicReal != null).length,
    };
  });
  // pooled within each company (each company's own average removed), so a company that always grows fast cannot fake a link
  const pooledX = companies.flatMap((c) => demean(c.points.map((x) => (x.organicReal != null ? x.industry : null))));
  const pooledY = companies.flatMap((c) => demean(c.points.map((x) => (x.industry != null ? x.organicReal : null))));
  const pooled = pearson(pooledX, pooledY);

  return {
    momentum: {
      years: Y,
      industries: codes.length,
      anchors: perAnchor.map((a) => ({ anchor: a.anchor, label: a.label, year: a.year, spearman: a.spearman, n: a.n })),
      medianSpearman,
      strength: correlationStrength(medianSpearman),
      positiveAnchors: perAnchor.filter((a) => (a.spearman ?? 0) > 0).length,
      persistence: p,
      latest: {
        from: monthLabel(months[anchors[anchors.length - 1].i - window + 1]),
        anchor: last.label,
        to: monthLabel(months[anchors[anchors.length - 1].i + 12 * Y]),
        spearman: last.spearman,
        points: codes
          .map((c, k) => ({ code: c, title: opts.statcanName.get(c) ?? c, past: last.xs[k], next: last.ys[k], ours: opts.highlight.has(c) }))
          .filter((x) => x.past != null && x.next != null) as OutlookReality["momentum"]["latest"]["points"],
      },
      sourceIds: ["statcan-36-10-0434"],
    },
    companies,
    pooled: { correlation: pooled, strength: correlationStrength(pooled), n: pooledX.filter((x, i) => x != null && pooledY[i] != null).length },
    sourceIds: ["statcan-36-10-0434", "statcan-18-10-0005", "onesheet-segments"],
  };
}
