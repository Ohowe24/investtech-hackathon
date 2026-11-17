"use client";

import type { Company, Dataset, IndexSnapshot } from "@contract/types";
import { formatMetric } from "@/lib/format";
import { Card } from "./ui";
import { Decode } from "./live/motion";

interface Props {
  dataset: Dataset;
  snapshot: IndexSnapshot;
  onOpen: (ticker: string) => void;
}

/** The answer on one page: which Canadian companies pass the bar, and why. No weights: the tool says which, not how much. */
export default function Recommendation({ dataset, onOpen }: Props) {
  const picks = dataset.companies.filter((c) => c.verdict === "add" && !c.inIndex).sort((a, b) => (a.model?.rank ?? 0) - (b.model?.rank ?? 0));
  if (picks.length === 0) return <Card title="Recommendation"><p className="text-sm text-muted">No Canadian candidate passes the bar yet.</p></Card>;
  const tested = dataset.companies.filter((c) => c.model && !c.inIndex).length;
  const yours = dataset.companies.filter((c) => c.inIndex).length;
  const checks = dataset.companies[0]?.model?.checks ?? [];

  return (
    <div className="enter space-y-5">
      <Card className="scan-once">
        <div className="flex items-center gap-2 text-[11px] font-medium uppercase tracking-wide text-muted">
          <span className="live-dot" /> Recommendation · {dataset.industryName ?? dataset.industryId}
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-ink">
          <Decode text={`Add ${listNames(picks.map((c) => c.name))}`} letters duration={1100} delay={200} />
        </h1>
        <p className="mt-1 text-sm text-muted">
          {picks.length} of {tested} Canadian {tested === 1 ? "candidate" : "candidates"} pass every must-pass check and enough of the {checks.filter((k) => k.kind === "score").length} scored checks
          {yours ? `, tested on the same bar as your ${yours} ${yours === 1 ? "stock" : "stocks"}` : ""}.
        </p>
      </Card>

      <div className={`grid gap-5 md:grid-cols-2 ${picks.length >= 3 ? "xl:grid-cols-3" : ""}`}>
        {picks.map((c) => (
          <Pick key={c.ticker} company={c} dataset={dataset} onOpen={onOpen} />
        ))}
      </div>
    </div>
  );
}

function Pick({ company: c, dataset, onOpen }: { company: Company; dataset: Dataset; onOpen: (t: string) => void }) {
  const m = c.model;
  const failed = m?.checks.filter((k) => k.pass === false) ?? [];
  const def = (id: string) => dataset.metricDefs.find((d) => d.id === id);
  // Three scored metrics, in check order, preferring the ones this company has a value for.
  const scoredIds = [...new Set((m?.checks ?? []).filter((k) => k.kind === "score").map((k) => k.metricId))];
  const ordered = [...scoredIds.filter((id) => c.metrics[id]?.value != null), ...scoredIds.filter((id) => c.metrics[id]?.value == null)];
  const stats = ordered.slice(0, 3).map((id) => ({ id, label: def(id)?.short ?? def(id)?.label ?? id, def: def(id) })).filter((s) => s.def);

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
        {m && <span className="font-mono text-sm font-semibold text-muted">#{m.rank}</span>}
      </div>

      {m && (
        <p className="mt-3 text-sm text-ink">
          Passes {m.passed} of {m.available} scored checks and every must-pass check. Ranked #{m.rank} of {dataset.companies.length}.
          {failed.length > 0 && <span className="text-muted"> Misses: {failed.map((k) => `${k.label} (${formatMetric(c.metrics[k.metricId], def(k.metricId)?.unit ?? "pct")})`).join(", ")}.</span>}
        </p>
      )}

      <div className="mt-4 grid grid-cols-3 gap-2 border-t border-line pt-3">
        {stats.map(({ id, label, def: d }, i) => (
          <div key={id}>
            {c.metrics[id]?.value == null
              ? <span className="block text-base font-semibold text-faint" title={c.metrics[id]?.note}>—</span>
              : <Decode text={formatMetric(c.metrics[id], d!.unit)} delay={900 + i * 120} className="block text-base font-semibold tabular-nums text-ink" />}
            <div className="text-[11px] text-muted">{label}</div>
          </div>
        ))}
      </div>

      <button onClick={() => onOpen(c.ticker)} className="mt-4 text-xs font-medium text-teal hover:underline">Full analysis →</button>
    </Card>
  );
}

/** "A", "A and B", "A, B and C". */
function listNames(names: string[]): string {
  return names.length <= 2 ? names.join(" and ") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}
