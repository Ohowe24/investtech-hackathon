"use client";

import { useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import { completeIndex, countryMix, sharePct, type IndexState } from "@/lib/indexMath";
import { pct } from "@/lib/format";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  onSelect: (ticker: string) => void;
}

export default function IndexBuilder({ dataset, snapshot, onSelect }: Props) {
  const defaultName = snapshot.indexes.some((i) => i.name === dataset.indexName)
    ? dataset.indexName
    : snapshot.indexes[0]?.name;
  const [indexName, setIndexName] = useState(defaultName);
  const index = snapshot.indexes.find((i) => i.name === indexName);
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
    <div className="rounded-xl border border-slate-200 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">Complete the index</h2>
        <select value={indexName} onChange={(e) => setIndexName(e.target.value)}
          className="rounded-md border border-slate-300 px-2 py-1 text-sm">
          {snapshot.indexes.map((i) => <option key={i.name}>{i.name}</option>)}
        </select>
      </div>
      <p className="mt-1 text-xs text-slate-500">
        Organizers&apos; live holdings as of {new Date(snapshot.updatedAt).toLocaleString("en-CA")} · {snapshot.source}
      </p>

      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <StateCard title="Before" state={before} />
        <StateCard title="After" state={after} />
      </div>

      {relabels.length > 0 && (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          {relabels.map((r) => (
            <div key={r.ticker}>
              <span className="font-semibold">{r.ticker}</span> is labelled {r.labelled} in the index, but our data says it is headquartered in {r.actual}.
            </div>
          ))}
        </div>
      )}

      <div className="mt-5 grid gap-4 md:grid-cols-3">
        <List title={`Added (${additions.length})`} empty="No additions yet"
          items={additions.map((a) => ({ ticker: a.ticker, text: `${pct(a.weightPct)} · ${dataset.companies.find((c) => c.ticker === a.ticker)?.reason ?? ""}` }))}
          onSelect={onSelect} tone="text-green-700" />
        <List title={`Rejected (${rejected.length})`} empty="Nothing rejected yet"
          items={rejected.map((c) => ({ ticker: c.ticker, text: c.reason ?? "" }))} onSelect={onSelect} tone="text-red-700" />
        <List title={`Watching (${watch.length})`} empty="Nothing on watch"
          items={watch.map((c) => ({ ticker: c.ticker, text: c.reason ?? "" }))} onSelect={onSelect} tone="text-amber-700" />
      </div>
    </div>
  );
}

function StateCard({ title, state }: { title: string; state: IndexState }) {
  const mix = countryMix(state);
  const ca = sharePct(state, "CA");
  return (
    <div className="rounded-lg bg-slate-50 p-4">
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="Holdings" value={String(state.rows.length)} />
        <Stat label="Cash" value={pct(state.cashPct)} />
        <Stat label="Canada" value={pct(ca)} />
      </div>
      <div className="mt-3 space-y-1">
        {mix.map((m) => (
          <div key={m.code} className="flex items-center gap-2 text-xs">
            <span className="w-6 text-slate-500">{m.code}</span>
            <div className="h-2 flex-1 rounded bg-slate-200">
              <div className={`h-2 rounded ${m.code === "CA" ? "bg-red-500" : "bg-slate-500"}`} style={{ width: `${Math.min(100, m.pct)}%` }} />
            </div>
            <span className="w-12 text-right text-slate-600">{pct(m.pct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-semibold text-slate-900">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-slate-500">{label}</div>
    </div>
  );
}

function List({ title, items, empty, onSelect, tone }: {
  title: string;
  items: { ticker: string; text: string }[];
  empty: string;
  onSelect: (t: string) => void;
  tone: string;
}) {
  return (
    <div>
      <h3 className={`text-sm font-semibold ${tone}`}>{title}</h3>
      {items.length === 0 ? (
        <p className="mt-1 text-xs text-slate-400">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {items.map((i) => (
            <li key={i.ticker} className="text-xs text-slate-700">
              <button onClick={() => onSelect(i.ticker)} className="font-semibold underline">{i.ticker}</button>{" "}
              {i.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
