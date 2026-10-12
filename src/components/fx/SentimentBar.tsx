import { TrendingUp, TrendingDown } from "lucide-react";

export type SentimentTrade = {
  direction: "up" | "down";
};

const flags: Record<string, string> = {
  "EUR/USD": "🇪🇺/🇺🇸",
  "GBP/USD": "🇬🇧/🇺🇸",
  "USD/JPY": "🇺🇸/🇯🇵",
  "USD/CHF": "🇺🇸/🇨🇭",
  "AUD/USD": "🇦🇺/🇺🇸",
  "NZD/USD": "🇳🇿/🇺🇸",
  "XAU/USD": "🏅/🇺🇸",
};

export const AssetSelector = ({
  value,
  assets,
  onChange,
}: {
  value: string;
  assets: string[];
  onChange: (v: string) => void;
}) => {
  return (
    <div className="relative">
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="appearance-none bg-[#0b0e14] border border-[#2b313f] text-white rounded-xl px-3 py-2 pr-8 text-sm font-semibold focus:outline-none focus:border-[#4a9eff] focus:ring-1 focus:ring-[#4a9eff]/30 transition-all"
      >
        {assets.map((a) => (
          <option key={a} value={a} className="bg-[#0b0e14]">
            {a}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-400">
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path
            fillRule="evenodd"
            d="M5.23 7.21a.75.75 0 011.06.02L10 10.94l3.71-3.71a.75.75 0 111.06 1.06l-4.24 4.25a.75.75 0 01-1.06 0L5.21 8.29a.75.75 0 01.02-1.08z"
            clipRule="evenodd"
          />
        </svg>
      </div>
      <div className="absolute -bottom-5 left-0 text-xs text-gray-500">{flags[value] ?? value}</div>
    </div>
  );
};

export const SentimentBar = ({ trades }: { trades: SentimentTrade[] }) => {
  const upCount = trades.filter((t) => t.direction === "up").length;
  const downCount = trades.filter((t) => t.direction === "down").length;
  const total = upCount + downCount;

  const upPct = total >= 5 ? Math.round((upCount / total) * 100) : 55;
  const downPct = 100 - upPct;

  return (
    <div className="flex items-center gap-2 h-5">
      <div className="flex items-center gap-1">
        <TrendingUp className="h-3 w-3 text-emerald-400" />
        <span className="text-[10px] font-semibold text-emerald-400">{upPct}%</span>
      </div>

      <div className="relative h-2 w-24 overflow-hidden rounded-full bg-[#1a1e2e]">
        <div className="absolute inset-0 flex items-center" style={{ width: `${upPct}%` }}>
          <div
            className="h-full bg-emerald-500 rounded-l-full"
            style={{ width: upPct > 0 ? "100%" : "0%" }}
          />
        </div>
        <div
          className="absolute inset-0 flex items-center justify-end"
          style={{ width: `${downPct}%` }}
        >
          <div
            className="h-full bg-red-500 rounded-r-full"
            style={{ width: downPct > 0 ? "100%" : "0%" }}
          />
        </div>
      </div>

      <div className="flex items-center gap-1">
        <span className="text-[10px] font-semibold text-red-400">{downPct}%</span>
        <TrendingDown className="h-3 w-3 text-red-400" />
      </div>
    </div>
  );
};
