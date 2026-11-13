"use client";

import type { Company, Dataset, IndexSnapshot } from "@contract/types";
import { amountFor, completeIndex, sharePct, type IndexState } from "@/lib/indexMath";
import { formatMetric, pct } from "@/lib/format";
import { Card } from "./ui";
import { Decode } from "./live/motion";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  onOpen: (ticker: string) => void;
}

/** The answer on one page: which companies we add, how much goes into each, why that size, and what the index looks like after. */
export default function Recommendation({ dataset, snapshot, onOpen }: Props) {
  const index = snapshot.indexes.find((i) => i.name === dataset.indexName) ?? snapshot.indexes[0];
  const picks = dataset.companies.filter((c) => c.verdict === "add" && !c.inIndex && c.proposedWeightPct != null);
  if (!index || picks.length === 0) return <Card title="Recommendation"><p className="text-sm text-muted">No companies to add yet.</p></Card>;

  const money = (v: number) =>
    Intl.NumberFormat("en-US", { style: "currency", currency: index.currency, maximumFractionDigits: 0 }).format(v);
  const additions = picks.map((c) => ({ ticker: c.ticker, name: c.name, weightPct: c.proposedWeightPct!, countryCode: c.hqCountry, subSector: c.subSector }));
  const overrides = Object.fromEntries(dataset.companies.map((c) => [c.ticker, c.hqCountry]));
  const { before, after } = completeIndex(index, additions, overrides);
  const totalPct = additions.reduce((s, a) => s + a.weightPct, 0);
  const fromCash = index.cashPct >= totalPct;
  const names = picks.map((c) => c.ticker).join(" and ");
  const related = ["CSU", "TOI"].every((t) => picks.some((c) => c.ticker === t));

  return (
    <div className="enter space-y-5">
      <Card className="scan-once">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
          <span className="live-dot" /> Recommendation · {dataset.indexName}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          <Decode text={`Add ${picks.map((c) => c.name).join(" and ")}`} letters duration={1100} delay={200} />
        </h1>
        <p className="mt-1 text-sm text-muted">
          <Decode text={money(amountFor(totalPct, index.totalValue))} delay={700} className="font-semibold text-ink" /> in total,{" "}
          <Decode text={pct(totalPct)} delay={800} className="font-semibold text-ink" /> of the index{fromCash ? ", paid from cash. Nothing is sold." : "."}
        </p>
      </Card>

      <div className="grid gap-5 md:grid-cols-2">
        {picks.map((c) => (
          <Pick key={c.ticker} company={c} dataset={dataset} amount={money(amountFor(c.proposedWeightPct!, index.totalValue))} onOpen={onOpen} />
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <Card title="Why these weights">
          <ul className="space-y-2.5 text-sm text-ink">
            {related && (
              <li>
                <span className="font-semibold">One bet, not two.</span> Constellation controls Topicus, so {names} share one slot.
              </li>
            )}
            <li>
              <span className="font-semibold">Capped at {pct(totalPct)}.</span> The same size as the index&apos;s top-tier holdings, so no single bet
              outweighs them.
            </li>
            {related && (
              <li>
                <span className="font-semibold">Split equally.</span> {pct(picks[0].proposedWeightPct!)} each.
              </li>
            )}
          </ul>
        </Card>

        <Card title="How it fits the index">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Change label="Holdings" from={String(before.rows.length)} to={String(after.rows.length)} />
            <Change label="Cash" from={pct(before.cashPct)} to={pct(after.cashPct)} />
            <Change label="Canadian" from={pct(sharePct(before, "CA"))} to={pct(sharePct(after, "CA"))} />
          </div>
          <WeightBar state={after} />
        </Card>
      </div>
    </div>
  );
}

function Pick({ company: c, dataset, amount, onOpen }: { company: Company; dataset: Dataset; amount: string; onOpen: (t: string) => void }) {
  const m = c.model;
  const failed = m?.checks.filter((k) => k.pass === false) ?? [];
  const def = (id: string) => dataset.metricDefs.find((d) => d.id === id);
  const stats = [
    { id: "fcfPerShareCagr", label: "FCF per share, growth a year" },
    { id: "cashReturn", label: "Return on capital" },
    { id: "netDebtToEbitda", label: "Net debt ÷ EBITDA" },
  ].map((s) => ({ ...s, def: def(s.id) })).filter((s) => s.def);

  return (
    <Card className="a-glow">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 font-mono text-xs font-semibold text-muted">
            {c.ticker}{c.listedOn ? ` · ${c.listedOn}` : ""}
            <span className="a-stamp rounded bg-signal px-1.5 py-px text-[10px] font-bold text-ink" style={{ animationDelay: "1100ms" }}>ADD</span>
          </div>
          <div className="text-lg font-semibold text-ink">{c.name}</div>
        </div>
        <div className="text-right">
          <Decode text={pct(c.proposedWeightPct!)} delay={600} duration={900} className="block text-2xl font-semibold tabular-nums text-teal" />
          <Decode text={amount} delay={800} className="block text-xs tabular-nums text-muted" />
        </div>
      </div>

      {m && (
        <p className="mt-3 text-sm text-ink">
          Passes {m.passed} of {m.available} scored checks and both must-pass checks. Ranked #{m.rank} of {dataset.companies.length}.
          {failed.length > 0 && <span className="text-muted"> Misses: {failed.map((k) => `${k.label} (${formatMetric(c.metrics[k.metricId], def(k.metricId)?.unit ?? "pct")})`).join(", ")}.</span>}
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
        {stats.map(({ id, label, def: d }, i) => (
          <div key={id}>
            <Decode text={formatMetric(c.metrics[id], d!.unit)} delay={900 + i * 120} className="block text-base font-semibold tabular-nums text-ink" />
            <div className="text-[11px] text-muted">{label}</div>
          </div>
        ))}
      </div>

      <button onClick={() => onOpen(c.ticker)} className="mt-4 text-xs font-medium text-teal hover:underline">Full analysis →</button>
    </Card>
  );
}

function Change({ label, from, to }: { label: string; from: string; to: string }) {
  return (
    <div>
      <div className="text-sm text-faint line-through decoration-faint/60">{from}</div>
      <Decode text={to} delay={700} duration={900} className="block text-lg font-semibold tabular-nums text-ink" />
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
    </div>
  );
}

/** Every holding after the change, as one bar; additions in teal, cash at the end. */
function WeightBar({ state }: { state: IndexState }) {
  const rows = [...state.rows].sort((a, b) => Number(b.isAddition) - Number(a.isAddition) || b.weightPct - a.weightPct);
  return (
    <div className="mt-5">
      <div className="flex h-5 w-full overflow-hidden rounded">
        {rows.map((r, i) => (
          <div key={r.ticker} title={`${r.ticker} ${pct(r.weightPct)}`}
            style={{ width: `${r.weightPct}%`, transformOrigin: "center bottom", animationDelay: `${r.isAddition ? 600 + rows.length * 55 + i * 160 : 400 + i * 55}ms` }}
            className={`a-grow-y border-r border-white ${r.isAddition ? "bg-teal shadow-[0_0_12px_rgba(61,220,108,0.8)]" : "bg-ink/25"}`} />
        ))}
        <div title={`Cash ${pct(state.cashPct)}`} style={{ width: `${state.cashPct}%` }} className="a-fade bg-soft" />
      </div>
      <div className="mt-2 flex gap-4 text-[11px] text-muted">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-teal" />New</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-ink/25" />Existing holdings</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm bg-soft" />Cash</span>
      </div>
    </div>
  );
}
