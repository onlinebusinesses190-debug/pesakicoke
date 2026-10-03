import { useSyncExternalStore } from "react";
import { getEngine } from "./engine";

export function useEngine() {
  const e = getEngine();
  useSyncExternalStore(e.subscribe, e.getVersion, e.getVersion);
  return e;
}

export const money = (v: number) =>
  v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/,/g, " ");

export const dt = (ms: number) => {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
};
