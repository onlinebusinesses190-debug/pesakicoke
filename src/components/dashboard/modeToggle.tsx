import { Link, useSearch } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function ModeToggle() {
  const search = useSearch({ from: "/trading" }) as { mode?: string };
  const currentMode = search?.mode === "real" ? "real" : "demo";

  return (
    <div className="flex items-center gap-1 rounded-lg bg-[#181d29] p-1 text-xs font-medium">
      <Link
        to="/trading"
        search={{ mode: "demo" }}
        className={`px-3 py-1.5 rounded-md transition-all ${
          currentMode === "demo"
            ? "bg-[#dcb13c] text-black"
            : "text-gray-400 hover:text-white hover:bg-[#202636]"
        }`}
      >
        Demo
      </Link>
      <Link
        to="/trading"
        search={{ mode: "real" }}
        className={`px-3 py-1.5 rounded-md transition-all ${
          currentMode === "real"
            ? "bg-[#dcb13c] text-black"
            : "text-gray-400 hover:text-white hover:bg-[#202636]"
        }`}
      >
        Real
      </Link>
    </div>
  );
}
