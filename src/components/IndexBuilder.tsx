"use client";

import type { Dataset, IndexSnapshot } from "@contract/types";
import { completeIndex, countryMix, sharePct, type IndexState } from "@/lib/indexMath";
import { pct } from "@/lib/format";
import { Card } from "./ui";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  onOpen: (ticker: string) => void;
}

export default function IndexBuilder({ dataset, snapshot, onOpen }: Props) {
  const index = snapshot.indexes.find((i) => i.name === dataset.indexName) ?? snapshot.indexes[0];
  if (!index) return null;

  const additions = dataset.companies
    .filter((c) => c.verdict === "add" && !c.inIndex)
    .map((c) => ({
      ticker: c.ticker,
      name: c.name,
      weightPct: c.proposedWeightPct ?? 0,
      countryCode: c.hqCountry,
      subSector: c.subSector,
    }));
  const overrides = Object.fromEntries(dataset.companies.map((c) => [c.ticker, c.hqCountry]));
  const { before, after, relabels } = completeIndex(index, additions, overrides);
  const rejected = dataset.companies.filter((c) => c.verdict === "reject");
  const watch = dataset.companies.filter((c) => c.verdict === "watch");

  return (
    <Card
      title="Before and after"
      right={<span className="text-xs text-faint">Additions funded from cash · holdings as of {new Date(snapshot.updatedAt).toLocaleDateString("en-CA")}</span>}
    >
      <div className="grid items-stretch gap-3 md:grid-cols-[1fr_auto_1fr]">
        <StateCard title="Before" state={before} />
        <div className="hidden items-center justify-center md:flex" aria-hidden>
          <span className="grid h-8 w-8 place-items-center rounded-full border border-black/[0.08] bg-white text-sm text-muted shadow-sm">→</span>
        </div>
        <StateCard title="After" state={after} highlight />
      </div>

      {relabels.length > 0 && (
        <div className="mt-4 rounded-xl border border-warn/15 bg-warnsoft px-4 py-3 text-[13px] leading-relaxed text-warn">
          {relabels.map((r) => (
            <div key={r.ticker}>
              <span className="font-semibold">{r.ticker}</span> is listed as {r.labelled} in the index, but is headquartered in {r.actual}.
            </div>
          ))}
        </div>
      )}

      <div className="mt-6 grid gap-3 md:grid-cols-3">
        <List title="Add" count={additions.length} empty="None"
          items={additions.map((a) => ({ ticker: a.ticker, text: pct(a.weightPct, 2) }))} tone="teal" numeric onOpen={onOpen} />
        <List title="Watch" count={watch.length} empty="None"
          items={watch.map((c) => ({ ticker: c.ticker, text: c.reason ?? "" }))} tone="warn" onOpen={onOpen} />
        <List title="Reject" count={rejected.length} empty="None"
          items={rejected.map((c) => ({ ticker: c.ticker, text: c.reason ?? "" }))} tone="bad" onOpen={onOpen} />
      </div>
    </Card>
  );
}

function StateCard({ title, state, highlight = false }: { title: string; state: IndexState; highlight?: boolean }) {
  const mix = countryMix(state);
  const ca = sharePct(state, "CA");
  return (
    <div className={`rounded-2xl border p-5 ${highlight ? "border-teal/25 bg-tealsoft/50" : "border-black/[0.06] bg-soft/60"}`}>
      <div className="flex items-center justify-between">
        <h3 className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${highlight ? "text-teal" : "text-muted"}`}>{title}</h3>
        {highlight && <span className="rounded-full bg-teal px-2 py-0.5 text-[10px] font-semibold text-white">Proposed</span>}
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <Stat label="Holdings" value={String(state.rows.length)} />
        <Stat label="Cash" value={pct(state.cashPct)} />
        <Stat label="Canadian" value={pct(ca)} accent={highlight} />
      </div>
      <div className="mt-5 space-y-2 border-t border-black/[0.06] pt-4">
        {mix.map((m) => (
          <div key={m.code} className="flex items-center gap-3 text-xs">
            <span className={`w-7 font-mono text-[11px] font-semibold ${m.code === "CA" ? "text-teal" : "text-muted"}`}>{m.code}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-black/[0.06]">
              <div className={`h-full rounded-full ${m.code === "CA" ? "bg-teal" : "bg-ink/35"}`} style={{ width: `${Math.min(100, m.pct)}%` }} />
            </div>
            <span className="w-12 text-right tabular-nums text-muted">{pct(m.pct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(0,0,0,0.04)]">
      <div className="text-[10px] font-semibold uppercase tracking-[0.1em] text-faint">{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums tracking-tight ${accent ? "text-teal" : "text-ink"}`}>{value}</div>
    </div>
  );
}

const TONE = {
  teal: { dot: "bg-teal", text: "text-teal", badge: "bg-tealsoft text-teal" },
  warn: { dot: "bg-warn", text: "text-warn", badge: "bg-warnsoft text-warn" },
  bad: { dot: "bg-bad", text: "text-bad", badge: "bg-badsoft text-bad" },
};

function List({ title, count, items, empty, tone, numeric = false, onOpen }: {
  onOpen: (t: string) => void;
  title: string;
  count: number;
  items: { ticker: string; text: string }[];
  empty: string;
  tone: keyof typeof TONE;
  numeric?: boolean;
}) {
  const t = TONE[tone];
  return (
    <div className="rounded-2xl border border-black/[0.06] bg-white p-4">
      <div className="flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${t.dot}`} />
        <h3 className={`text-[11px] font-semibold uppercase tracking-[0.12em] ${t.text}`}>{title}</h3>
        <span className={`ml-auto rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${t.badge}`}>{count}</span>
      </div>
      {items.length === 0 ? (
        <p className="mt-3 text-xs text-faint">{empty}</p>
      ) : (
        <ul className="mt-3 space-y-1">
          {items.map((i) => (
            <li key={i.ticker}>
              <button onClick={() => onOpen(i.ticker)}
                className={`flex w-full gap-3 rounded-lg px-2 py-1.5 text-left text-xs transition-colors hover:bg-soft ${numeric ? "items-center" : "items-start"}`}>
                <span className="shrink-0 rounded-md bg-soft px-1.5 py-0.5 font-mono text-[11px] font-semibold text-ink">{i.ticker}</span>
                <span className={numeric ? "ml-auto font-semibold tabular-nums text-ink" : "leading-relaxed text-muted"}>{i.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
