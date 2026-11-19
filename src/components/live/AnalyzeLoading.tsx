"use client";

import { useEffect, useState } from "react";
import { panelsClass, usePanelTheme } from "../theme";

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
    const t = setInterval(() => setI((n) => n + 1), 500); // all six steps in 3 seconds
    return () => clearInterval(t);
  }, []);

  const theme = usePanelTheme();
  const list = steps ?? ["Starting the engine"];
  const at = Math.min(i, list.length - 1);
  return (
    <div className="min-h-screen w-full">
      <header className="border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 w-full max-w-[1240px] items-center gap-2 px-5 py-2 text-sm font-semibold tracking-tight text-white md:px-8">
          <span className="grid h-6 w-6 place-items-center rounded-md bg-white text-[11px] font-bold text-[#050505]">X</span>
          Index X-ray
        </div>
      </header>
      <div className={`${panelsClass(theme)} mx-auto flex min-h-[75vh] w-full max-w-[1240px] items-center px-5 py-8 md:px-8`}>
        <section className="panel mx-auto grid w-full max-w-4xl gap-8 px-6 py-8 md:grid-cols-[1fr_340px] md:px-9"
          style={{ backgroundImage: "radial-gradient(70% 120% at 0% 0%, var(--color-tealsoft), transparent 55%)" }}>
          <div className="min-w-0 self-center">
            <div className="kicker flex items-center gap-2"><span className="live-dot" /> Engine running</div>
            <h1 key={at} className="a-fade mt-4 text-[28px] font-bold leading-tight tracking-[-0.03em] text-ink md:text-[34px]">{list[at]}…</h1>
            <p className="mt-3 text-[14px] text-muted">Every number comes from filings. The counts appear when the run finishes.</p>
            <div className="mt-5 h-1 overflow-hidden rounded-full bg-soft">
              <div className="h-full rounded-full bg-teal transition-[width] duration-700" style={{ width: `${((at + 1) / list.length) * 100}%` }} />
            </div>
          </div>
          <ol className="flex flex-col gap-1.5">
            {list.map((s, n) => (
              <li key={s} className={`flex items-center gap-3 rounded-xl border px-3.5 py-2.5 text-[13px] transition-colors duration-300 ${n === at ? "border-teal/50 bg-tealsoft text-ink" : n < at ? "border-line text-ink" : "border-line text-faint"}`}>
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full font-mono text-[10px] font-semibold ${n < at ? "bg-tealsoft text-teal" : n === at ? "bg-teal text-white [.panels-dark_&]:text-[#03160a]" : "ring-1 ring-inset ring-line"}`}>
                  {n < at ? "✓" : n + 1}
                </span>
                <span className="min-w-0">{s}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </div>
  );
}
