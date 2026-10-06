// Where the Back button goes when there's no previous page (your main website's features hub).
export const EXIT_URL = "/";

export const ksh = (v: number, signed = false) => {
  const s = Math.abs(v).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (!signed) return `KSh ${v < 0 ? "-" : ""}${s}`;
  return `${v > 0 ? "+" : v < 0 ? "-" : ""}KSh ${s}`;
};

export const mmss = (sec: number) => {
  const s = Math.max(0, Math.floor(sec));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  const p = (n: number) => String(n).padStart(2, "0");
  return h ? `${h}:${p(m)}:${p(r)}` : `${p(m)}:${p(r)}`;
};

export const when = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
