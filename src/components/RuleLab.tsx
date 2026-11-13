"use client";

import type { Company, Dataset } from "@contract/types";
import { formatValue, recStyle, verdictStyle } from "@/lib/format";
import { Card } from "./ui";

const status = (pass: boolean | null) => pass === null ? "Missing evidence" : pass ? "Meets rule" : "Below standard";

/** Explains the published thesis and decisions without changing the model's standards. */
export default function RuleLab({ dataset, onOpen }: {
  dataset: Dataset;
  onOpen: (ticker: string) => void;
}) {
  const candidates = dataset.companies.filter((c) => c.hqCountry === "CA" && !c.inIndex);
  const additions = candidates.filter((c) => c.verdict === "add");
  const others = candidates.filter((c) => c.verdict !== "add");

  const evidence = (company: Company) => {
    const model = company.model;
    const supported = model?.checks.filter((c) => c.pass === true) ?? [];
    const concerns = model?.checks.filter((c) => c.pass !== true) ?? [];
    return (
      <Card key={company.ticker} title={`${company.ticker} · ${company.name}`} right={<span className={`rounded px-2 py-1 text-xs ${verdictStyle[company.verdict].badge}`}>{verdictStyle[company.verdict].label}</span>}>
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted">
          {model && <span className={`rounded px-2 py-1 ${recStyle[model.recommendation].badge}`}>Model: {recStyle[model.recommendation].label}</span>}
          <span>Decision: {company.verdictSource === "human" ? "analyst override" : company.verdictSource === "model" ? "published model" : "published decision"}</span>
          {model && <span>{supported.length}/{model.checks.length} checks meet the standard</span>}
        </div>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div><h3 className="text-sm font-semibold text-ink">Supporting evidence</h3>
            <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted">{supported.map((check) => <li key={check.id}><span className="font-medium text-teal">✓ </span>{check.rule}.</li>)}</ul>
            {supported.length === 0 && <p className="mt-2 text-xs text-muted">No passing checks are available in the published model.</p>}
          </div>
          <div><h3 className="text-sm font-semibold text-ink">What still needs attention</h3>
            {concerns.length ? <ul className="mt-2 space-y-2 text-xs leading-relaxed text-muted">{concerns.map((check) => <li key={check.id}><span className="font-medium text-warn">{check.pass === null ? "Missing evidence" : "Does not meet rule"}: </span>{check.rule}.</li>)}</ul> : <p className="mt-2 text-xs leading-relaxed text-muted">{model ? "No failed or missing checks in this screen. Valuation and deal-level due diligence remain separate questions." : "Published model unavailable; no supporting conclusion can be drawn here."}</p>}
            {company.verdictSource === "human" && company.reason && <p className="mt-2 text-xs text-muted">Analyst rationale: {company.reason}</p>}
          </div>
        </div>
        <details className="mt-4 border-t border-line pt-3">
          <summary className="cursor-pointer text-xs font-medium text-teal">Inspect figures, fixed rules and sources</summary>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[570px] text-left text-xs">
              <caption className="sr-only">Published checks and supporting sources for {company.ticker}</caption>
              <thead><tr className="border-b border-line text-muted">{["Measure / period", "Actual", "Fixed rule", "Evidence"].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead>
              <tbody>{model?.checks.map((check) => {
                const metric = company.metrics[check.metricId];
                const def = dataset.metricDefs.find((m) => m.id === check.metricId);
                return <tr key={check.id} className="border-b border-line text-muted">
                  <td className="px-2 py-3"><span className="font-medium text-ink">{def?.short ?? def?.label ?? check.metricId}</span><div className="mt-1">{metric?.period ?? "Period unavailable"} · {check.kind === "gate" ? "Required gate" : "Scored check"}</div>{metric?.note && <p className="mt-1 max-w-sm">{metric.note}</p>}
                    <div className="mt-1 flex flex-wrap gap-2">{metric?.sourceIds.map((id) => { const source = dataset.sources.find((s) => s.id === id); return source?.url ? <a key={id} href={source.url} target="_blank" rel="noreferrer" className="text-teal underline">{source.label}</a> : <span key={id}>{source?.label ?? id}</span>; })}</div>
                  </td>
                  <td className="px-2 py-3 tabular-nums text-ink">{formatValue(metric?.value, def?.unit ?? "pct")}</td>
                  <td className="max-w-xs px-2 py-3">{check.rule}</td>
                  <td className={`px-2 py-3 font-medium ${check.pass === true ? "text-teal" : "text-warn"}`}>{status(check.pass)}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>
        </details>
        <button type="button" onClick={() => onOpen(company.ticker)} className="mt-4 text-xs font-medium text-teal underline">Open {company.ticker} company research →</button>
      </Card>
    );
  };

  return (
    <div className="space-y-5">
      <div className="max-w-3xl text-white">
        <p className="text-xs uppercase tracking-widest text-white/50">The case behind our selections</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Tested thesis</h1>
        <p className="mt-3 text-lg leading-relaxed">Select Canadian acquirers that turn growth into cash flow per share, with disciplined debt and adequate cash returns on invested capital.</p>
        <p className="mt-2 text-sm leading-relaxed text-white/60">Getting bigger alone is not enough. We apply the same declared standards to every candidate and trace each result to the underlying figures.</p>
      </div>
      <Card title="What the evidence supports">
        <div className="grid gap-5 sm:grid-cols-3">
          <div><p className="text-xs text-muted">Canadian candidates evaluated</p><p className="mt-1 text-2xl font-semibold text-ink">{candidates.length}</p></div>
          <div><p className="text-xs text-muted">Published additions</p><p className="mt-1 text-2xl font-semibold text-teal">{additions.map((c) => c.ticker).join(" + ") || "None"}</p></div>
          <div><p className="text-xs text-muted">Watch or reject</p><p className="mt-1 text-2xl font-semibold text-ink">{others.length}</p></div>
        </div>
        <p className="mt-4 border-t border-line pt-4 text-sm leading-relaxed text-muted">The sections below explain the existing index decisions using the published model. Fixed rules make the case consistent: acquisition activity establishes theme fit, debt is a required gate, and per-share growth, cash return, share count and acquisition spending determine the score.</p>
      </Card>
      <div><h2 className="text-lg font-semibold text-white">Why these additions</h2><p className="mt-1 text-sm text-white/60">The supporting evidence and remaining caveats, together.</p></div>
      {additions.map(evidence)}
      {!additions.length && <Card><p className="text-sm text-muted">The published dataset currently recommends no Canadian additions.</p></Card>}
      <div><h2 className="text-lg font-semibold text-white">Why we did not select the others</h2><p className="mt-1 text-sm text-white/60">The same standards explain the watchlist and rejections.</p></div>
      {others.map(evidence)}
      <Card title="How to read this conclusion">
        <p className="text-sm leading-relaxed text-muted">{dataset.rules?.result ?? "Published results use the declared acquirer gates and scored checks. Missing data stays unknown."}</p>
        <p className="mt-3 text-xs leading-relaxed text-muted">This evidence supports fit with our selection framework; it does not prove that acquisitions caused the growth or that these stocks will outperform. Cash return is a company-wide measure. Share issuance and acquisition spending are screening signals, not proof of deal financing or value destruction. Source quality, valuation and individual deals still require research.</p>
      </Card>
    </div>
  );
}
