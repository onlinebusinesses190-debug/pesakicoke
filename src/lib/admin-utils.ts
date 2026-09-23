export function fmtKES(n: number) {
  const sign = n < 0 ? "-" : "";
  return sign + "KES " + Math.abs(n).toLocaleString();
}

export function fmtCompact(n: number) {
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
