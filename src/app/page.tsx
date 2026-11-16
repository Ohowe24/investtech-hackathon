import Link from "next/link";
import Onboarding from "@/components/onboarding/Onboarding";
import { industryCatalog, marketKnown, storeIsFake } from "@/lib/server/analysis";

// Step one of the tool: pick an industry, enter the index's holdings, run. The answer opens /analyze.
// The catalog (industries, their checks, the Canadian candidates and which have data) is built on the server
// from data/store.json and data/indexes.json.
export default function Home() {
  const catalog = industryCatalog();
  const market = marketKnown();
  return (
    <div className="min-h-screen w-full">
      {storeIsFake() && (
        <div className="bg-red-600 px-4 py-2 text-center text-sm font-semibold text-white">FAKE SAMPLE DATA: not real companies or numbers</div>
      )}
      <header className="sticky top-0 z-40 border-b border-white/10 bg-black/35 backdrop-blur-xl">
        <div className="mx-auto flex min-h-14 w-full max-w-[1240px] items-center gap-6 px-5 py-2 md:px-8">
          <Link href="/" className="flex items-center gap-2 text-sm font-semibold tracking-tight text-white">
            <span className="logo-scan grid h-6 w-6 place-items-center rounded-md bg-white text-[11px] font-bold text-ink">X</span>
            Index X-ray
          </Link>
          <span className="ml-auto hidden text-[12px] text-white/50 sm:block">Canadian candidates for any index · Onesheet data</span>
        </div>
      </header>
      <main className="enter">
        <Onboarding catalog={catalog} market={market} />
      </main>
      <footer className="px-5 pb-8 text-center text-[11px] text-white/50">Not investment advice · Onesheet API and SEDAR filings</footer>
    </div>
  );
}
