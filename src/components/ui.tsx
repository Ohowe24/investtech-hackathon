import type { ReactNode } from "react";

/** Bordered section card with a small label row, in the house style. */
export function Card({ label, lead, rest, right, children, className = "" }: {
  label: string;
  lead?: string;
  rest?: string;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`min-w-0 rounded-2xl border border-line bg-white p-5 md:p-7 ${className}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-[13px] font-medium text-ink">
            <span className="inline-block h-2 w-2 rounded-[2px] bg-teal" />
            {label}
          </div>
          {(lead || rest) && (
            <p className="mt-3 text-[15px] leading-snug text-muted">
              {lead && <span className="font-medium text-ink">{lead} </span>}
              {rest}
            </p>
          )}
        </div>
        {right}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Segmented control. */
export function Segmented<T extends string>({ value, onChange, options }: {
  value: T;
  onChange: (v: T) => void;
  options: { id: T; label: string }[];
}) {
  return (
    <div className="inline-flex rounded-lg border border-line bg-white p-0.5 text-xs font-medium">
      {options.map((o) => (
        <button key={o.id} onClick={() => onChange(o.id)}
          className={`rounded-md px-3 py-1.5 transition-colors ${value === o.id ? "bg-ink text-white" : "text-muted hover:text-ink"}`}>
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Pass / fail / no-data dot. */
export function Dot({ pass, size = 10 }: { pass: boolean | null; size?: number }) {
  const style = { width: size, height: size };
  if (pass === null) return <span style={style} className="inline-block rounded-full border border-dashed border-faint" />;
  return <span style={style} className={`inline-block rounded-full ${pass ? "bg-teal" : "bg-bad"}`} />;
}
