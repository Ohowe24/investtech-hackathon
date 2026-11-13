"use client";

import type { Dataset } from "@contract/types";
import { formatMetric, pct, recStyle, verdictStyle } from "@/lib/format";
import { scoredMetricInfo } from "@/lib/explain";
import { metricState, scoredMetrics, stateText } from "@/lib/rank";
import { Dot, Explain, Segmented } from "./ui";
import { Decode } from "./live/motion";

// Row timing: each row lands, then its checks fire one by one, then its result stamps.
const ROW = 110;
const PIP = 75;

interface Props {
  dataset: Dataset;
  scope: "ca" | "all";
  onScope: (s: "ca" | "all") => void;
  onOpen: (ticker: string) => void;
}

/** The overview: one row per company, best first. Click a row to open the company. */
export default function CompanyTable({ dataset, scope, onScope, onOpen }: Props) {
  const tested = dataset.companies.filter((c) => c.model);
  const candidates = tested.filter((c) => !c.inIndex);
  const metrics = scoredMetrics(dataset);
  const rows = (scope === "ca" ? candidates : tested).sort((a, b) => a.model!.rank - b.model!.rank);

  return (
    <section key={scope} className="scan-once overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
        <Segmented value={scope} onChange={onScope} options={[
          { id: "ca", label: `Canadian · ${candidates.length}` },
          { id: "all", label: `All · ${tested.length}` },
        ]} />
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Dot pass={true} size={8} /> Pass</span>
          <span className="flex items-center gap-1.5"><Dot pass={false} size={8} /> Fail</span>
          <span className="flex items-center gap-1.5"><Dot pass={null} size={8} /> No data</span>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-[11px] font-medium uppercase tracking-wide text-faint">
              <th className="w-12 py-2.5 pl-5 text-left font-medium">#</th>
              <th className="py-2.5 text-left font-medium">Company</th>
              <th className="py-2.5 text-left font-medium">
                <Explain info={{ title: "Result", how: dataset.rules?.result }} className="uppercase tracking-wide">Result</Explain>
              </th>
              {metrics.map((d) => (
                <th key={d.id} className="px-3 py-2.5 text-right font-medium">
                  <Explain info={scoredMetricInfo(dataset, d.id)} className="uppercase tracking-wide">{d.short ?? d.label}</Explain>
                </th>
              ))}
              <th className="px-3 py-2.5 text-left font-medium">
                <Explain info={{ title: "Checks", how: "One bar per check. Count = checks passed out of checks with data." }} className="uppercase tracking-wide">Checks</Explain>
              </th>
              <th className="py-2.5 text-right font-medium">
                <Explain info={{ title: "Proposed weight", how: dataset.rules?.weight }} className="uppercase tracking-wide">Weight</Explain>
              </th>
              <th className="w-10" />
            </tr>
          </thead>
          <tbody>
            {rows.map((c, r) => {
              const m = c.model!;
              const rec = recStyle[m.recommendation];
              const t0 = 250 + r * ROW;
              const stampAt = t0 + 300 + m.checks.length * PIP;
              return (
                <tr key={c.ticker} onClick={() => onOpen(c.ticker)} tabIndex={0} onKeyDown={(e) => e.key === "Enter" && onOpen(c.ticker)}
                  style={{ animationDelay: `${t0}ms` }}
                  className="a-rise group relative cursor-pointer border-b border-line outline-none transition-colors last:border-0 hover:bg-canvas focus-visible:bg-canvas">
                  <td className="relative py-3.5 pl-5 font-mono text-xs tabular-nums text-faint">
                    <span className="absolute inset-y-1 left-0 w-[3px] origin-center scale-y-0 rounded-r bg-signal transition-transform duration-300 group-hover:scale-y-100" />
                    {m.rank}
                  </td>
                  <td className="py-3.5 pr-3">
                    <div className="flex items-center gap-3">
                      <span className="grid h-8 w-12 shrink-0 place-items-center rounded-md bg-soft font-mono text-[11px] font-semibold text-ink">{c.ticker}</span>
                      <div className="min-w-0">
                        <div className="truncate font-medium text-ink">{c.name}</div>
                        <div className="truncate text-xs text-faint">{c.subSector}{scope === "all" && !c.inIndex ? " · Candidate" : ""}</div>
                      </div>
                    </div>
                  </td>
                  <td className="py-3.5 pr-3">
                    <span className={`a-stamp rounded-full px-2.5 py-1 text-xs font-medium ${rec.badge}`} style={{ animationDelay: `${stampAt}ms` }}>{rec.label}</span>
                  </td>
                  {metrics.map((d, j) => {
                    const st = metricState(c, d.id);
                    return (
                      <td key={d.id} className={`px-3 py-3.5 text-right font-mono text-[13px] tabular-nums ${stateText[st]}`}>
                        {st === "none" ? "—" : <Decode text={formatMetric(c.metrics[d.id], d.unit)} delay={t0 + 120 + j * 60} duration={520} />}
                      </td>
                    );
                  })}
                  <td className="px-3 py-3.5">
                    <div className="flex items-center gap-2">
                      <div className="flex gap-[3px]">
                        {m.checks.map((k, i) => (
                          <span key={k.id} title={k.label} style={{ animationDelay: `${t0 + 300 + i * PIP}ms` }}
                            className={`a-pip h-4 w-1.5 rounded-full ${k.pass === null ? "bg-line text-line" : k.pass ? "bg-teal text-signal" : "bg-bad text-bad"}`} />
                        ))}
                      </div>
                      <span className="font-mono text-xs tabular-nums text-muted">
                        {m.checks.filter((k) => k.pass).length}/{m.checks.filter((k) => k.pass !== null).length}
                      </span>
                    </div>
                  </td>
                  <td className="py-3.5 text-right font-mono text-[13px] tabular-nums">
                    {c.proposedWeightPct != null ? (
                      <Decode text={pct(c.proposedWeightPct, 2)} delay={stampAt} className="font-semibold text-ink" />
                    ) : (
                      <span className="font-sans text-xs text-faint">{c.inIndex ? "Held" : verdictStyle[c.verdict].label}</span>
                    )}
                  </td>
                  <td className="pr-4 text-right text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink">›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
