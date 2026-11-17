import { Suspense } from "react";
import Link from "next/link";
import { connection } from "next/server";
import Workbench from "@/components/Workbench";
import AnalyzeLoading from "@/components/live/AnalyzeLoading";
import { fromSearch } from "@/lib/query";
import { runAnalysis } from "@/lib/server/analysis";

// The result of the onboarding. The address holds the whole question (industry, and your stocks if any),
// so a result can be reloaded, shared or edited. The engine runs here, on the server, per request.

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default function AnalyzePage({ searchParams }: { searchParams: SearchParams }) {
  return (
    <Suspense fallback={<AnalyzeLoading />}>
      <Analysis searchParams={searchParams} />
    </Suspense>
  );
}

async function Analysis({ searchParams }: { searchParams: SearchParams }) {
  await connection(); // the engine stamps each run with the time it ran, so this renders per request
  const params = await searchParams;
  const query = fromSearch(params);
  const result = query ? await runAnalysis(query) : { ok: false as const, error: "The address has no industry or holdings." };
  if (!result.ok || !query) {
    return (
      <div className="panels panels-dark mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-5">
        <section className="panel px-7 py-8 text-center">
          <div className="kicker">Index X-ray</div>
          <h1 className="mt-3 text-xl font-semibold tracking-tight text-ink">Nothing to analyze</h1>
          <p className="mt-2 text-sm text-muted">{result.ok ? "" : result.error}</p>
          <Link href="/" className="mx-auto mt-6 inline-block rounded-[10px] bg-ink px-4 py-2 text-sm font-semibold text-white">Start over</Link>
        </section>
      </div>
    );
  }
  return <Workbench dataset={result.dataset} snapshot={result.snapshot} query={query} />;
}
