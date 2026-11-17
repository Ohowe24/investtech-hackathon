"use client";

import { useEffect, useState } from "react";

/*
  Shown while the server runs the engine for /analyze. It says, in order, what the engine does.
  No numbers: the counts are not known until the run finishes, and then the run screen shows them.
*/

const STEPS = (industry: string, mine: number) => [
  `Generating Canadian candidates in ${industry}`,
  mine ? `Pulling annual statements for the candidates and your ${mine} ${mine === 1 ? "stock" : "stocks"}` : "Pulling annual statements for every candidate",
  "Computing each company's KPIs from its filings",
  "Comparing candidates against the industry's checks",
  "Rejecting candidates that fail a must-pass check",
  "Ranking what is left",
];

function industryFromAddress(): { name: string; mine: number } {
  const p = new URLSearchParams(window.location.search);
  const id = p.get("industry") ?? "";
  const mine = (p.get("h") ?? "").split(",").filter(Boolean).length;
  const known: Record<string, string> = { reits: "REITs", acquirers: "serial acquirers" };
  const name = known[id] ?? id.replace(/^custom:/, "").replace(/-/g, " ").replace(/\band\b/g, "&");
  return { name: name || "this industry", mine };
}

export default function AnalyzeLoading() {
  const [steps, setSteps] = useState<string[] | null>(null);
  const [i, setI] = useState(0);

  useEffect(() => {
    const read = () => {
      const { name, mine } = industryFromAddress();
      setSteps(STEPS(name, mine));
    };
    read();
    const t = setInterval(() => setI((n) => n + 1), 900);
    return () => clearInterval(t);
  }, []);

  const list = steps ?? ["Starting the engine"];
  const at = Math.min(i, list.length - 1);
  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-lg flex-col justify-center px-5">
      <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-[0.18em] text-signal">
        <span className="live-dot" /> Engine running
      </div>
      <h1 key={at} className="a-fade mt-3 text-2xl font-semibold tracking-tight text-white md:text-3xl">{list[at]}…</h1>
      <ol className="mt-6 space-y-2 font-mono text-[12px]">
        {list.map((s, n) => (
          <li key={s} className={`flex items-center gap-2.5 transition-colors duration-300 ${n < at ? "text-signal" : n === at ? "text-white" : "text-white/30"}`}>
            <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full text-[9px] ${n < at ? "bg-signal/20" : n === at ? "bg-signal text-ink" : "bg-white/10"}`}>
              {n < at ? "✓" : n + 1}
            </span>
            {s}
          </li>
        ))}
      </ol>
    </div>
  );
}
