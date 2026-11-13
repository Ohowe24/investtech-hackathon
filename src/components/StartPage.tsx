"use client";

import { useEffect, useState } from "react";
import type { Dataset, IndexSnapshot } from "@contract/types";
import { pct } from "@/lib/format";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  onDone: () => void;
}

const STEP_MS = 750;

/** Pick a track, run the analysis. Only the track the engine has data for runs; the other is a placeholder. */
export default function StartPage({ dataset, snapshot, onDone }: Props) {
  const [picked, setPicked] = useState(dataset.indexName);
  const [step, setStep] = useState<number | null>(null);

  const tested = dataset.companies.filter((c) => c.model);
  const nChecks = tested[0]?.model?.checks.length ?? 0;
  const steps = [
    `Loading statements · ${tested.length} companies`,
    `Running ${nChecks} checks`,
    `Ranking ${tested.filter((c) => !c.inIndex).length} candidates`,
  ];
  const ready = picked === dataset.indexName;

  // The loading screen is for show: the data is already built. It only paces the reveal.
  useEffect(() => {
    if (step == null) return;
    const t = setTimeout(() => (step >= steps.length ? onDone() : setStep(step + 1)), step >= steps.length ? 250 : STEP_MS);
    return () => clearTimeout(t);
  }, [step, steps.length, onDone]);

  if (step != null) {
    return (
      <div className="mx-auto flex min-h-[70vh] w-full max-w-sm flex-col justify-center">
        <div className="text-sm font-semibold text-ink">{picked}</div>
        <div className="mt-4 h-1 overflow-hidden rounded-full bg-line">
          <div className="h-full rounded-full bg-ink transition-all ease-out" style={{ width: `${(Math.min(step + 1, steps.length) / steps.length) * 100}%`, transitionDuration: `${STEP_MS}ms` }} />
        </div>
        <ul className="mt-5 space-y-2.5 text-[13px]">
          {steps.map((s, i) => (
            <li key={s} className={`flex items-center gap-2.5 transition-colors ${i < step ? "text-ink" : i === step ? "text-ink" : "text-faint"}`}>
              {i < step ? (
                <span className="grid h-4 w-4 place-items-center rounded-full bg-teal text-[9px] text-white">✓</span>
              ) : i === step ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-line border-t-ink" />
              ) : (
                <span className="h-4 w-4 rounded-full border border-line" />
              )}
              {s}
            </li>
          ))}
        </ul>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col justify-center">
      <div className="text-[11px] font-medium uppercase tracking-wide text-faint">Track</div>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {[...snapshot.indexes].sort((a) => (a.name === dataset.indexName ? -1 : 1)).map((ix) => {
          const on = picked === ix.name;
          return (
            <button key={ix.name} onClick={() => setPicked(ix.name)} aria-pressed={on}
              className={`rounded-xl border bg-white p-5 text-left transition-all ${on ? "border-ink shadow-[0_0_0_1px_#000]" : "border-line hover:border-faint"}`}>
              <div className="flex items-start justify-between gap-3">
                <span className="text-[15px] font-semibold tracking-tight text-ink">{ix.name}</span>
                <span className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${on ? "border-ink bg-ink" : "border-line"}`}>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-white" />}
                </span>
              </div>
              <div className="mt-6 flex gap-6 font-mono text-xs tabular-nums text-muted">
                <span><span className="text-base font-semibold text-ink">{ix.holdings}</span> holdings</span>
                <span><span className="text-base font-semibold text-ink">{pct(ix.cashPct)}</span> cash</span>
              </div>
            </button>
          );
        })}
      </div>
      <button onClick={() => ready && setStep(0)} disabled={!ready}
        className="mt-5 h-11 rounded-lg bg-ink text-sm font-semibold text-white transition-opacity hover:opacity-85 disabled:bg-line disabled:text-faint disabled:hover:opacity-100">
        {ready ? "Run candidate analysis" : "Not available yet"}
      </button>
    </div>
  );
}
