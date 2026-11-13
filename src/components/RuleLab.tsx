"use client";

import { useState } from "react";
import type { Dataset, ModelResult } from "@contract/types";
import { config } from "../../engine/config";
import { compareRules, controls, defaultSettings, type RuleSettings } from "../../engine/sensitivity";
import { formatValue, recStyle } from "@/lib/format";
import { Card, Segmented } from "./ui";

function Result({ value }: { value: ModelResult["recommendation"] }) {
  return <span className={`inline-block rounded px-2 py-1 text-xs font-medium ${recStyle[value].badge}`}>{recStyle[value].label}</span>;
}
const status = (pass: boolean | null) => pass === null ? "Missing data" : pass ? "Pass" : "Fail";

export default function RuleLab({ dataset, settings, onSettings, onOpen }: {
  dataset: Dataset;
  settings: RuleSettings;
  onSettings: (settings: RuleSettings) => void;
  onOpen: (ticker: string) => void;
}) {
  const [scope, setScope] = useState<"ca" | "all">("ca");
  const rows = dataset.companies.filter((c) => scope === "all" || (c.hqCountry === "CA" && !c.inIndex))
    .map((company) => ({ company, ...compareRules(company, settings) }));
  const defaults = defaultSettings();
  const edited = controls.some((c) => settings[c.id] !== defaults[c.id]);
  const count = (which: "baseline" | "scenario") => rows.filter((r) => r[which].recommendation === "pass").length;

  return (
    <div className="space-y-5">
      <div className="max-w-2xl text-white">
        <p className="text-xs uppercase tracking-widest text-white/50">Acquirer rule sensitivity</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">Test the conclusion</h1>
        <p className="mt-2 text-sm leading-relaxed text-white/70">Would you still choose the same acquirers if your standards changed? Adjust the limits, keep the company data fixed, and see exactly what changes the model’s answer.</p>
      </div>

      <Card title="Your screening limits" right={<button type="button" onClick={() => onSettings(defaultSettings())} disabled={!edited} className="rounded-md border border-line px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-40">Reset to defaults</button>}>
        <div className="grid gap-6 md:grid-cols-3">
          {controls.map((control) => (
            <div key={control.id}>
              <label htmlFor={`rule-${control.id}`} className="text-sm font-medium text-ink">{control.label}</label>
              <div className="mt-3 flex items-baseline justify-between gap-2">
                <output htmlFor={`rule-${control.id}`} className="text-2xl font-semibold tabular-nums text-ink">{formatValue(settings[control.id], control.unit)}</output>
                <span className="text-xs text-muted">Default {formatValue(defaults[control.id], control.unit)}</span>
              </div>
              <input id={`rule-${control.id}`} type="range" min={control.min} max={control.max} step={control.step} value={settings[control.id]}
                aria-valuetext={formatValue(settings[control.id], control.unit)}
                onChange={(e) => onSettings({ ...settings, [control.id]: Number(e.target.value) })}
                className="my-3 w-full cursor-pointer accent-teal" />
              <p className="text-xs leading-relaxed text-muted">{control.why}</p>
            </div>
          ))}
        </div>
        <p className="mt-5 border-t border-line pt-4 text-xs leading-relaxed text-muted">Research sandbox: these settings last while you navigate this page. Refresh resets them. Saved company decisions, portfolio weights and the Map remain unchanged.</p>
      </Card>

      <Card title="What changes?" right={<Segmented value={scope} onChange={setScope} options={[{ id: "ca", label: "Canadian candidates" }, { id: "all", label: "All companies" }]} />}>
        <div role="status" aria-live="polite" className="mb-5 grid gap-3 sm:grid-cols-3">
          {[["Pass default rules", count("baseline")], ["Pass your rules", count("scenario")], ["Changed model results", rows.filter((r) => r.changed).length]].map(([label, value]) => (
            <div key={label} className="rounded-lg bg-soft px-4 py-3"><div className="text-2xl font-semibold tabular-nums text-ink">{value}<span className="text-sm font-normal text-muted"> / {rows.length}</span></div><div className="mt-1 text-xs text-muted">{label}</div></div>
          ))}
        </div>
        <p className="mb-4 text-xs text-muted">A model pass is a research candidate, not an automatic addition. Open a company’s checks to inspect the evidence.</p>
        <div className="space-y-3">
          {rows.map(({ company, baseline, scenario, changedChecks, changed }) => (
            <details key={company.ticker} className={`rounded-lg border ${changed ? "border-teal/40 bg-tealsoft/20" : "border-line"}`}>
              <summary className="cursor-pointer px-4 py-3 text-sm text-ink">
                <div className="ml-1 inline-flex w-[calc(100%-1.5rem)] flex-wrap items-center gap-x-3 gap-y-2 align-middle">
                  <span className="min-w-0 flex-1"><strong>{company.ticker}</strong> <span className="text-muted">{company.name}</span><span className="block pt-1 text-xs text-muted">{company.inIndex ? "Existing holding" : "Candidate"} · {scenario.checks.filter((c) => c.pass !== null).length}/{scenario.checks.length} checks have data</span></span>
                  <span className="flex items-center gap-2"><span className="sr-only">Default:</span><Result value={baseline.recommendation} /><span aria-hidden="true">→</span><span className="sr-only">Your rules:</span><Result value={scenario.recommendation} /></span>
                  <span className="w-full text-xs text-muted">{changedChecks.length ? `${changedChecks.length} check${changedChecks.length === 1 ? "" : "s"} changed${changed ? "; model result changed" : "; overall result unchanged"}.` : "No check outcomes changed."}</span>
                </div>
              </summary>
              <div className="border-t border-line px-4 py-4">
                <p className="mb-3 text-xs text-muted">Your score: {scenario.passed}/{scenario.available} available scored checks pass. {scenario.checks.some((c) => c.kind === "gate" && c.pass === false) ? "A required gate fails." : scenario.checks.some((c) => c.kind === "gate" && c.pass === null) ? "A required gate is missing evidence." : "Both required gates pass."}</p>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[620px] text-left text-xs">
                    <caption className="sr-only">{company.ticker} default versus adjusted checks</caption>
                    <thead><tr className="border-b border-line text-muted">{["Check / metric period", "Actual", "Default limit", "Your limit", "Outcome"].map((label) => <th key={label} className="px-2 py-2 font-medium">{label}</th>)}</tr></thead>
                    <tbody>{scenario.checks.map((check, i) => {
                      const metric = company.metrics[check.metricId];
                      const def = dataset.metricDefs.find((m) => m.id === check.metricId);
                      const unit = def?.unit ?? "pct";
                      const differs = check.pass !== baseline.checks[i].pass;
                      return <tr key={check.id} className={`border-b border-line ${differs ? "bg-tealsoft/50" : ""}`}>
                        <td className="px-2 py-3"><span className="font-medium">{def?.short ?? def?.label ?? check.metricId}</span> <span className="text-muted">({check.kind === "gate" ? "required gate" : "scored"})</span><div className="mt-1 text-muted">{metric?.period ?? "Period unavailable"}</div>{metric?.note && <div className="mt-1 max-w-sm text-muted">{metric.note}</div>}
                          <div className="mt-1 flex flex-wrap gap-2">{metric?.sourceIds.map((id) => { const source = dataset.sources.find((s) => s.id === id); return source?.url ? <a key={id} href={source.url} target="_blank" rel="noreferrer" className="text-teal underline">{source.label}</a> : <span key={id} className="text-muted">{source?.label ?? id}</span>; })}</div>
                        </td>
                        <td className="px-2 py-3 tabular-nums">{formatValue(metric?.value, unit)}</td>
                        <td className="px-2 py-3 tabular-nums">{check.op} {formatValue(baseline.checks[i].threshold, unit)}</td>
                        <td className="px-2 py-3 tabular-nums">{check.op} {formatValue(check.threshold, unit)}</td>
                        <td className="px-2 py-3 font-medium">{differs ? `${status(baseline.checks[i].pass)} → ` : ""}{status(check.pass)}</td>
                      </tr>;
                    })}</tbody>
                  </table>
                </div>
                <button type="button" onClick={() => onOpen(company.ticker)} className="mt-4 text-xs font-medium text-teal underline">Open {company.ticker} company research →</button>
              </div>
            </details>
          ))}
          {rows.length === 0 && <p className="text-sm text-muted">No companies in this scope.</p>}
        </div>
      </Card>

      <Card title="Still the same acquirer model">
        <p className="text-sm leading-relaxed text-muted">The acquisition theme, share-count check and acquisition-spend check stay fixed. Only your tolerance for leverage, per-share growth and cash return changes.</p>
        <ul className="mt-3 list-disc space-y-1 pl-5 text-xs text-muted">{config.checks.filter((k) => !controls.some((c) => c.id === k.id)).map((k) => <li key={k.id}>{k.rule} ({k.kind === "gate" ? "required gate" : "scored"}).</li>)}</ul>
        <p className="mt-3 text-xs leading-relaxed text-muted">Passes requires both gates, at least {config.scoring.minAvailable} scored checks with data, and {config.scoring.passShare * 100}% of available scored checks passing. Fails means a failed gate or fewer than {config.scoring.mixedShare * 100}% passing; otherwise Mixed. Missing evidence never becomes a pass or a zero.</p>
        <p className="mt-3 text-xs leading-relaxed text-muted">This tests screening assumptions, not future returns, valuation or the probability of success. Cash return is FCF / average debt plus equity, not the return on individual deals. Share issuance alone does not prove value destruction; acquisition spend / operating cash flow does not establish how deals were financed. Those questions still need company research.</p>
      </Card>
    </div>
  );
}
