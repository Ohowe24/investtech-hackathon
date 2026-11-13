"use client";

import type { Company, Dataset } from "@contract/types";
import { formatMetric, recStyle, verdictStyle } from "@/lib/format";

interface Props {
  dataset: Dataset;
  company: Company | null;
}

export default function DetailPanel({ dataset, company }: Props) {
  if (!company) {
    return (
      <div className="rounded-xl border border-slate-200 p-5 text-sm text-slate-500">
        Click a company on the map to see its numbers and where each one comes from.
      </div>
    );
  }

  const sourceById = new Map(dataset.sources.map((s) => [s.id, s]));
  const v = verdictStyle[company.verdict];

  return (
    <div className="rounded-xl border border-slate-200 p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">{company.name}</h3>
          <p className="text-sm text-slate-500">
            {company.ticker}
            {company.listedOn ? ` · ${company.listedOn}` : ""} · HQ {company.hqCountry}
            {company.subSector ? ` · ${company.subSector}` : ""}
          </p>
        </div>
        <span className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium ${v.badge}`}>{v.label}</span>
      </div>

      <p className="mt-2 text-sm text-slate-600">
        Zone: <span className="font-medium text-slate-900">{company.zone}</span>
      </p>
      {company.reason && (
        <p className="mt-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-800">
          {company.reason}
          <span className="mt-1 block text-[11px] text-slate-400">
            {company.verdictSource === "model" ? "Set by the model's declared rules" : "Set by a human reviewer"}
          </span>
        </p>
      )}

      {company.model && (
        <div className="mt-4">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-semibold text-slate-900">The test</h4>
            <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${recStyle[company.model.recommendation].badge}`}>
              {recStyle[company.model.recommendation].label} · {company.model.passed}/{company.model.available} scored · rank {company.model.rank}
            </span>
          </div>
          <ul className="mt-2 space-y-1.5">
            {company.model.checks.map((k) => (
              <li key={k.id} className="flex items-start gap-2 text-sm">
                <span className={`mt-1.5 inline-block h-2.5 w-2.5 shrink-0 rounded-full ${k.pass === null ? "border border-slate-300" : k.pass ? "bg-green-500" : "bg-red-500"}`} />
                <span className="text-slate-700">
                  <span className="font-medium text-slate-900">{k.label}</span>
                  {k.kind === "gate" && <span className="ml-1 text-[11px] text-slate-400">must pass</span>}
                  <span className="block text-xs text-slate-500">
                    {k.rule}: {k.pass === null ? "no data" : k.pass ? "yes" : "no"}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <table className="mt-4 w-full text-sm">
        <tbody>
          {dataset.metricDefs.map((def) => {
            const m = company.metrics[def.id];
            return (
              <tr key={def.id} className="border-t border-slate-100 align-top">
                <td className="py-2 pr-2 text-slate-600" title={def.description}>
                  {def.label}
                  {m?.period && <div className="text-[11px] text-slate-400">{m.period}</div>}
                </td>
                <td className="py-2 text-right">
                  <div className={m?.value == null ? "text-slate-400" : "font-medium text-slate-900"}>
                    {formatMetric(m, def.unit)}
                  </div>
                  {m?.note && <div className="text-[11px] text-slate-400">{m.note}</div>}
                  {m?.sourceIds?.length ? (
                    <div className="text-[11px]">
                      {m.sourceIds.map((id) => {
                        const s = sourceById.get(id);
                        return s?.url ? (
                          <a key={id} href={s.url} target="_blank" rel="noreferrer" className="mr-2 text-blue-600 underline">{s.label}</a>
                        ) : (
                          <span key={id} className="mr-2 text-slate-400" title={s?.quote}>{s?.label ?? id}{s?.quote ? `: “${s.quote}”` : ""}</span>
                        );
                      })}
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
