import { useNavigate, useSearch } from "@tanstack/react-router";
import { cn } from "@/lib/utils";

export function ModeToggle() {
  const search = useSearch() as { mode?: string };
  const currentMode = search?.mode === "real" ? "real" : "demo";
  const navigate = useNavigate();

  const setMode = (mode: "demo" | "real") => {
    navigate({
      search: (prev: any) => ({ ...prev, mode }),
    });
  };

  return (
    <div className="flex items-center gap-1 rounded-lg bg-[#181d29] p-1 text-xs font-medium">
      <button
        onClick={() => setMode("demo")}
        className={cn(
          "px-3 py-1.5 rounded-md transition-all",
          currentMode === "demo"
            ? "bg-[#dcb13c] text-black"
            : "text-gray-400 hover:text-white hover:bg-[#202636]"
        )}
      >
        Demo
      </button>
      <button
        onClick={() => setMode("real")}
        className={cn(
          "px-3 py-1.5 rounded-md transition-all",
          currentMode === "real"
            ? "bg-[#dcb13c] text-black"
            : "text-gray-400 hover:text-white hover:bg-[#202636]"
        )}
      >
        Real
      </button>
    </div>
  );
}
