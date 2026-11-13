// Small line icons for the Guide, drawn on a 24-unit grid so they sit on the text baseline.

type P = { className?: string };

const line = { fill: "none", stroke: "currentColor", strokeWidth: 2, strokeLinecap: "round", strokeLinejoin: "round" } as const;

export function Sparkle({ className = "h-3.5 w-3.5" }: P) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path fill="currentColor" d="M12 2c.6 5.5 4.5 9.4 10 10-5.5.6-9.4 4.5-10 10-.6-5.5-4.5-9.4-10-10 5.5-.6 9.4-4.5 10-10Z" />
    </svg>
  );
}

export function Close({ className = "h-3.5 w-3.5" }: P) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path {...line} d="M6 6l12 12M18 6 6 18" /></svg>;
}

export function Reset({ className = "h-3.5 w-3.5" }: P) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path {...line} d="M3 12a9 9 0 1 0 2.8-6.5L3 8M3 3v5h5" /></svg>;
}

export function ArrowUp({ className = "h-3.5 w-3.5" }: P) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path {...line} d="M12 19V5M5 12l7-7 7 7" /></svg>;
}

export function ArrowRight({ className = "h-3 w-3" }: P) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path {...line} d="M5 12h14M13 6l6 6-6 6" /></svg>;
}

export function Check({ className = "h-3 w-3" }: P) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path {...line} strokeWidth={2.5} d="M5 12.5 9.5 17 19 7" /></svg>;
}

export function Chevron({ className = "h-3 w-3" }: P) {
  return <svg viewBox="0 0 24 24" className={className} aria-hidden><path {...line} d="m9 6 6 6-6 6" /></svg>;
}
