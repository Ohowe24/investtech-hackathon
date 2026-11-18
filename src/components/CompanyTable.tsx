"use client";

import type { Dataset } from "@contract/types";
import { formatMetric, recStyle, verdictStyle } from "@/lib/format";
import { scoredMetricInfo } from "@/lib/explain";
import { metricState, scoredMetrics, stateText } from "@/lib/rank";
import { Dot, Explain, Segmented } from "./ui";
import { ScoreCell } from "./Ranking";
import { Decode } from "./live/motion";

// Row timing: each row lands, then its checks fire one by one, then its result stamps.
const ROW = 110;
const PIP = 75;

interface Props {
  dataset: Dataset;
  scope: "ca" | "held" | "all";
  onScope: (s: "ca" | "held" | "all") => void;
  onOpen: (ticker: string) => void;
  /** re-run with the full candidate universe (true) or only the provided candidates (false) */
  onCandidates?: (more: boolean) => void;
}

/** The overview: one row per company, best first. Click a row to open the company. */
export default function CompanyTable({ dataset, scope, onScope, onOpen, onCandidates }: Props) {
  const tested = dataset.companies.filter((c) => c.model);
  const candidates = tested.filter((c) => !c.inIndex);
  const metrics = scoredMetrics(dataset);
  const hasScore = !!dataset.rules?.score;
  const held = tested.filter((c) => c.inIndex);
  const set = dataset.candidateSet;
  const provided = new Set(set?.provided ?? []);
  const indexLabel = dataset.holdingsSource === "organizers" ? "Index" : "Your index";
  const rows = (scope === "ca" ? candidates : scope === "held" && held.length ? held : tested)
    .sort((a, b) => a.model!.rank - b.model!.rank);

  return (
    <div className="space-y-5">
    {set && onCandidates && <MoreCandidates set={set} tested={candidates.length} onCandidates={onCandidates} />}
    <section key={scope} className="scan-once overflow-hidden rounded-xl border border-line bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-5 py-3">
          <Segmented value={scope === "held" && !held.length ? "all" : scope} onChange={onScope} options={[
            { id: "ca", label: `Candidates · ${candidates.length}` },
            ...(held.length ? [{ id: "held" as const, label: `${indexLabel} · ${held.length}` }] : []),
            { id: "all", label: held.length ? `Candidates + ${indexLabel.toLowerCase()} · ${tested.length}` : `All · ${tested.length}` },
          ]} />
        <div className="flex items-center gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5"><Dot pass={true} size={8} /> Pass</span>
          <span className="flex items-center gap-1.5"><Dot pass={false} size={8} /> Fail</span>
          <span className="flex items-center gap-1.5"><Dot pass={null} size={8} /> No data</span>
          {held.length > 0 && <span className="flex items-center gap-1.5"><HeldChip /> In the {indexLabel.toLowerCase()}</span>}
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[960px] text-sm">
          <thead>
            <tr className="border-b border-line bg-canvas text-[11px] font-medium uppercase tracking-wide text-faint">
              <th className="w-12 py-2.5 pl-5 text-left font-medium">#</th>
              <th className="py-2.5 text-left font-medium">Company</th>
              {hasScore && (
                <th className="px-3 py-2.5 text-left font-medium">
                  <Explain info={{ title: "Quality score", how: dataset.rules?.score }} className="uppercase tracking-wide">Score / 100</Explain>
                </th>
              )}
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
              <th className="py-2.5 text-right font-medium">Verdict</th>
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
                    {r + 1}
                  </td>
                  <td className="py-3.5 pr-3">
                    <div className="flex items-center gap-3">
                      <span className={`grid h-8 w-12 shrink-0 place-items-center rounded-md font-mono text-[11px] font-semibold text-ink ${c.inIndex ? "border border-dashed border-faint" : "bg-soft"}`}>{c.ticker}</span>
                      <div className="min-w-0">
                        <div className="flex min-w-0 items-center gap-2">
                          <span className="truncate font-medium text-ink">{c.name}</span>
                          {c.inIndex && <HeldBadge label={indexLabel} />}
                          {set?.mode === "expanded" && provided.has(c.ticker) && <ProvidedBadge />}
                        </div>
                        <div className="truncate text-xs text-faint">{c.subSector}{scope === "all" && !c.inIndex ? " · Candidate" : ""}</div>
                      </div>
                    </div>
                  </td>
                  {hasScore && <td className="px-3 py-3.5"><ScoreCell score={m.score} big /></td>}
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
                    <span className={`font-sans text-xs ${c.verdict === "add" ? "font-semibold text-teal" : "text-faint"}`}>{c.inIndex ? "Yours" : verdictStyle[c.verdict].label}</span>
                  </td>
                  <td className="pr-4 text-right text-faint transition-transform group-hover:translate-x-0.5 group-hover:text-ink">›</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
    </div>
  );
}

/** The candidate set this run tests, and the button to add the rest of the researched universe (or go back to the provided ones). */
function MoreCandidates({ set, tested, onCandidates }: { set: NonNullable<Dataset["candidateSet"]>; tested: number; onCandidates: (more: boolean) => void }) {
  const expanded = set.mode === "expanded";
  return (
    <section className="panel flex flex-wrap items-center justify-between gap-4 px-6 py-5">
      <div className="min-w-0 max-w-2xl">
        <div className="kicker">{expanded ? "Expanded candidate set" : "Provided candidates"}</div>
        <h2 className="mt-1.5 text-base font-semibold tracking-tight text-ink">
          {expanded
            ? `${tested} Canadian candidates: the ${set.provided.length} provided plus ${tested - set.provided.length} more`
            : `Testing the ${set.provided.length} candidates the organizers provided`}
        </h2>
        <p className="mt-1 text-[13px] text-muted">
          {expanded
            ? `Added from our researched list of Canadian serial acquirers, each with a cited source. The ${set.provided.length} provided ones are marked.`
            : `${set.provided.join(", ")}. Our researched list has ${set.more} more Canadian serial acquirers with filing data; add them to test the same checks on a wider field.`}
        </p>
      </div>
      {expanded ? (
        <button onClick={() => onCandidates(false)}
          className="rounded-[10px] border border-line px-4 py-2 text-[13.5px] font-medium text-ink transition-colors hover:border-ink">
          Back to the {set.provided.length} provided
        </button>
      ) : (
        <button onClick={() => onCandidates(true)}
          className="rounded-[10px] bg-ink px-4 py-2 text-[13.5px] font-semibold text-white">
          Generate more candidates · +{set.more}
        </button>
      )}
    </section>
  );
}

/** One of the candidates the organizers gave us to analyze. */
function ProvidedBadge() {
  return (
    <span title="One of the candidates the organizers provided"
      className="shrink-0 whitespace-nowrap rounded-full bg-teal/10 px-2 py-px text-[10.5px] font-medium text-teal">
      Provided
    </span>
  );
}

/** Marks a stock the index already holds (the holdings entered on the setup page). */
export function HeldBadge({ label = "Your index" }: { label?: string }) {
  return (
    <span title="Already held by the index: one of the stocks entered at setup"
      className="shrink-0 whitespace-nowrap rounded-full border border-dashed border-faint px-2 py-px text-[10.5px] font-medium text-muted">
      {label}
    </span>
  );
}

function HeldChip() {
  return <span className="inline-block h-2.5 w-3.5 rounded-[3px] border border-dashed border-faint" />;
}
