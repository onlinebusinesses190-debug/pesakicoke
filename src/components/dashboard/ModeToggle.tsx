import { cn } from "@/lib/utils";

export function ModeToggle() {
  // Read current mode from URL (e.g., ?mode=real or ?mode=demo)
  const params = new URLSearchParams(window.location.search);
  const currentMode = params.get("mode") === "real" ? "real" : "demo";

  const setMode = (mode: "demo" | "real") => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", mode);
    window.location.href = url.toString(); // Navigate to the new URL
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
