"use client";

import { useSyncExternalStore } from "react";

/*
  Panel look: dark glass (default) or light. One setting for the whole site, kept in this
  browser only (localStorage), shared live between the front page and the results.
*/

export type PanelTheme = "dark" | "light";
const KEY = "panel-theme";
const EVENT = "panel-theme";

function read(): PanelTheme {
  try { return window.localStorage.getItem(KEY) === "light" ? "light" : "dark"; } catch { return "dark"; }
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

export function setPanelTheme(t: PanelTheme) {
  try { window.localStorage.setItem(KEY, t); } catch {}
  window.dispatchEvent(new Event(EVENT));
}

/** The current panel look; dark on the server and until the browser's choice is read. */
export function usePanelTheme(): PanelTheme {
  return useSyncExternalStore(subscribe, read, () => "dark");
}

/** The class that turns a container's panels light or dark. */
export function panelsClass(t: PanelTheme): string {
  return `panels ${t === "dark" ? "panels-dark" : "panels-light"}`;
}

/** Light / Dark switch. Only the panels change; the backdrop stays. */
export function ThemeSwitch() {
  const theme = usePanelTheme();
  return (
    <div role="group" aria-label="Panel colour" className="flex items-center rounded-md border border-white/15 p-0.5 text-[12px] font-medium">
      {(["light", "dark"] as const).map((t) => (
        <button key={t} type="button" onClick={() => setPanelTheme(t)} aria-pressed={theme === t}
          className={`rounded px-2 py-0.5 transition-colors ${theme === t ? "bg-white/15 text-white" : "text-white/55 hover:text-white"}`}>
          {t === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}
