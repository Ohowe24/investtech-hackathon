"use client";

import { useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import { completeIndex, countryMix, sharePct, type IndexState } from "@/lib/indexMath";
import { pct } from "@/lib/format";
import { Card } from "./ui";

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
    <Card
      label="Complete the index"
      lead="Additions are funded from cash."
      rest={`Organizers' live holdings as of ${new Date(snapshot.updatedAt).toLocaleString("en-CA")} · ${snapshot.source}`}
      right={
        <select value={indexName} onChange={(e) => setIndexName(e.target.value)}
          className="rounded-lg border border-line bg-white px-2.5 py-1.5 text-xs font-medium text-ink">
          {snapshot.indexes.map((i) => <option key={i.name}>{i.name}</option>)}
        </select>
      }
    >
      <div className="grid gap-4 md:grid-cols-2">
        <StateCard title="Before" state={before} />
        <StateCard title="After" state={after} />
      </div>

      {relabels.length > 0 && (
        <div className="mt-4 rounded-xl bg-warnsoft p-3 text-sm text-warn">
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
          onSelect={onSelect} tone="text-teal" />
        <List title={`Rejected (${rejected.length})`} empty="Nothing rejected yet"
          items={rejected.map((c) => ({ ticker: c.ticker, text: c.reason ?? "" }))} onSelect={onSelect} tone="text-bad" />
        <List title={`Watching (${watch.length})`} empty="Nothing on watch"
          items={watch.map((c) => ({ ticker: c.ticker, text: c.reason ?? "" }))} onSelect={onSelect} tone="text-warn" />
      </div>
    </Card>
  );
}

function StateCard({ title, state }: { title: string; state: IndexState }) {
  const mix = countryMix(state);
  const ca = sharePct(state, "CA");
  return (
    <div className="rounded-xl border border-line p-4">
      <h3 className="text-sm font-semibold text-ink">{title}</h3>
      <div className="mt-2 grid grid-cols-3 gap-2 text-center">
        <Stat label="Holdings" value={String(state.rows.length)} />
        <Stat label="Cash" value={pct(state.cashPct)} />
        <Stat label="Canada" value={pct(ca)} />
      </div>
      <div className="mt-3 space-y-1">
        {mix.map((m) => (
          <div key={m.code} className="flex items-center gap-2 text-xs">
            <span className="w-6 text-muted">{m.code}</span>
            <div className="h-2 flex-1 rounded bg-soft">
              <div className={`h-2 rounded ${m.code === "CA" ? "bg-teal" : "bg-ink/40"}`} style={{ width: `${Math.min(100, m.pct)}%` }} />
            </div>
            <span className="w-12 text-right text-muted">{pct(m.pct)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-lg font-semibold text-ink">{value}</div>
      <div className="text-[11px] uppercase tracking-wide text-muted">{label}</div>
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
        <p className="mt-1 text-xs text-faint">{empty}</p>
      ) : (
        <ul className="mt-1 space-y-2">
          {items.map((i) => (
            <li key={i.ticker} className="text-xs text-ink">
              <button onClick={() => onSelect(i.ticker)} className="font-semibold underline">{i.ticker}</button>{" "}
              {i.text}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
