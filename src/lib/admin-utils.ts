export function fmtKES(n: number): string {
  const sign = n < 0 ? "-" : "";
  return sign + "KES " + Math.abs(n).toLocaleString();
}

export function fmtCompact(n: number): string {
  if (Math.abs(n) >= 1_000_000) return "KES " + (n / 1_000_000).toFixed(1) + "M";
  if (Math.abs(n) >= 1_000) return "KES " + (n / 1_000).toFixed(1) + "K";
  return "KES " + n.toLocaleString();
}

export function fmtDate(dateStr: string): string {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30)
    return `${Math.floor(diffDays / 7)} week${Math.floor(diffDays / 7) > 1 ? "s" : ""} ago`;
  return d.toLocaleDateString("en-KE", { year: "numeric", month: "short", day: "numeric" });
}

export function fmtPercent(num: number, den: number): string {
  if (den === 0) return "0%";
  return ((num / den) * 100).toFixed(1) + "%";
}

export function truncate(str: string, len: number): string {
  if (!str) return "";
  return str.length <= len ? str : str.substring(0, len) + "...";
}
