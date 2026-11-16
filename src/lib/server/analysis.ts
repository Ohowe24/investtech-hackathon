// Server side of the onboarding: the industry catalog, and one analysis run for any holdings.
// Reads only data/store.json (engine output) and data/indexes.json (organizers' feed); every
// number comes from analyze() in engine/analyze.ts, the same function `npm run engine` uses.

import storeJson from "@data/store.json";
import snapshotJson from "@data/indexes.json";
import type { Dataset, IndexDef, IndexPosition, IndexSnapshot } from "@contract/types";
import { analyze } from "../../../engine/analyze";
import { industries, getIndustry } from "../../../engine/industries";
import type { IndustryProfile } from "../../../engine/industries/types";
import { passes } from "../../../engine/metrics";
import type { Store } from "../../../engine/store";
import type { IndustryOption, TickerInfo } from "../catalog";
import { resolveWeights, type AnalysisQuery } from "../query";

const store = storeJson as unknown as Store;
const snapshot = snapshotJson as unknown as IndexSnapshot;

/** True while the store was built from engine/input-sample. The site then shows a FAKE banner on every page. */
export const storeIsFake = (): boolean => store.isFake;

/** True when the store has enough data for at least one of the profile's checks. */
function measurable(profile: IndustryProfile, ticker: string): boolean {
  const s = store.companies[ticker];
  if (!s) return false;
  const { metrics } = profile.computeMetrics(s.financials, { ticker, lookup: (f) => s.extras[f], facts: s.facts, distributions: s.distributions ?? [] });
  return profile.checks.some((k) => passes(metrics[k.metricId]?.value, k.op, k.threshold) !== null);
}

function nameOf(profile: IndustryProfile, ticker: string): string {
  const u = profile.universe.find((x) => x.ticker === ticker);
  const s = store.companies[ticker];
  return u?.name ?? (s && s.name !== ticker ? s.name : undefined) ?? profile.holdingNames[ticker] ?? ticker;
}

const organizersIndex = (profile: IndustryProfile): IndexDef | undefined => snapshot.indexes.find((i) => i.name === profile.indexName);

export function industryCatalog(): IndustryOption[] {
  return Object.values(industries).map((profile) => {
    const ix = organizersIndex(profile);
    const info = (t: string): TickerInfo => ({ ticker: t, name: nameOf(profile, t), hasData: measurable(profile, t) });
    const knownTickers = new Set([
      ...Object.keys(store.companies).filter((t) => measurable(profile, t)),
      ...Object.keys(profile.holdingNames),
      ...(ix?.positions.map((p) => p.ticker) ?? []),
    ]);
    // Candidates are suggested separately; the holdings box suggests everything else.
    for (const u of profile.universe) knownTickers.delete(u.ticker);
    return {
      id: profile.id,
      name: profile.name,
      tagline: profile.tagline,
      question: profile.question,
      checks: profile.checks.map((k) => ({ id: k.id, label: k.label, kind: k.kind, rule: k.rule })),
      universe: profile.universe.map((u) => ({ ...info(u.ticker), subSector: u.subSector, listedOn: u.listedOn, why: u.why })),
      organizers: ix
        ? {
            name: ix.name,
            currency: ix.currency,
            cashPct: ix.cashPct,
            totalValue: ix.totalValue,
            updatedAt: snapshot.updatedAt,
            holdings: ix.positions.map((p) => ({ ...info(p.ticker), weightPct: p.weightPct, subSector: p.subSector, countryCode: p.countryCode })),
          }
        : null,
      defaultCashPct: ix?.cashPct ?? profile.sleevePct,
      known: [...knownTickers].sort().map(info),
      sleevePct: profile.sleevePct,
      maxWeightPct: profile.maxWeightPct,
    };
  });
}

export type AnalysisResult =
  | { ok: true; dataset: Dataset; snapshot: IndexSnapshot; weightRule: string }
  | { ok: false; error: string };

/** Runs the engine on the holdings in the query. The organizers' index is used as is when the query matches it exactly. */
export function runAnalysis(q: AnalysisQuery): AnalysisResult {
  if (!industries[q.industry]) return { ok: false, error: `Unknown industry "${q.industry}".` };
  const profile = getIndustry(q.industry);
  const ix = organizersIndex(profile);
  const holdings = q.holdings.slice(0, 60);
  if (holdings.length === 0) return { ok: false, error: "No holdings were entered." };

  const sameAsOrganizers =
    !!ix &&
    ix.positions.length === holdings.length &&
    holdings.every((h) => {
      const p = ix.positions.find((x) => x.ticker === h.ticker);
      return p && (h.weightPct == null || Math.abs(h.weightPct - p.weightPct) < 1e-9);
    });

  let index: IndexDef;
  let weightRule: string;
  if (sameAsOrganizers) {
    index = ix!;
    weightRule = "The organizers' live weights and cash.";
  } else {
    const resolved = resolveWeights(holdings, q.cashPct ?? ix?.cashPct ?? profile.sleevePct);
    if (!resolved.ok) return { ok: false, error: resolved.error };
    weightRule = resolved.rule;
    const totalValue = q.value ?? ix?.totalValue;
    const positions: IndexPosition[] = holdings.map((h) => {
      const known = ix?.positions.find((p) => p.ticker === h.ticker);
      const s = store.companies[h.ticker];
      const inUniverse = profile.universe.some((u) => u.ticker === h.ticker);
      const countryCode = s?.hqCountry || (inUniverse ? "CA" : known?.countryCode) || "??";
      return {
        ticker: h.ticker,
        country: known?.country ?? countryCode,
        countryCode,
        subSector: known?.subSector ?? s?.subSector ?? profile.universe.find((u) => u.ticker === h.ticker)?.subSector ?? "Not classified",
        weightPct: resolved.weights[h.ticker],
      };
    });
    index = {
      name: profile.indexName,
      currency: ix?.currency ?? profile.currency,
      totalValue: totalValue ?? 0,
      cash: totalValue != null ? (resolved.cashPct / 100) * totalValue : 0,
      cashPct: resolved.cashPct,
      holdings: positions.length,
      method: weightRule,
      positions,
    };
  }

  const { dataset } = analyze(profile, store, {
    holdings: index.positions.map((p) => p.ticker),
    holdingsSource: sameAsOrganizers ? "organizers" : "user",
    positions: index.positions,
  });
  const snap: IndexSnapshot = {
    updatedAt: sameAsOrganizers ? snapshot.updatedAt : dataset.generatedAt,
    source: sameAsOrganizers ? snapshot.source : "Entered by you",
    indexes: [index, ...snapshot.indexes.filter((i) => i.name !== index.name)],
  };
  return { ok: true, dataset, snapshot: snap, weightRule };
}
