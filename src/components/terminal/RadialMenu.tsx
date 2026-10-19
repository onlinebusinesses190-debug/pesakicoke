import { X, Crosshair, Settings, BarChart2 } from "lucide-react";

interface RadialMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentTf: string;
  onSelectTf: (tf: string) => void;
}

export function RadialMenu({ isOpen, onClose, currentTf, onSelectTf }: RadialMenuProps) {
  if (!isOpen) return null;
  const timeframes = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 backdrop-blur-[1px]" onClick={onClose}>
      <div
        className="relative w-[280px] h-[280px] rounded-full border-[20px] border-[#1565c0]/90 shadow-2xl flex items-center justify-center bg-transparent"
        onClick={(e) => e.stopPropagation()}
      >
        <button onClick={onClose} className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white hover:bg-white/30 transition-colors">
          <X size={24} />
        </button>

        {timeframes.map((tf, i) => {
          const angle = (i / timeframes.length) * 2 * Math.PI - Math.PI / 2;
          const radius = 140;
          const x = Math.cos(angle) * radius;
          const y = Math.sin(angle) * radius;

          return (
            <button
              key={tf}
              onClick={() => { onSelectTf(tf); onClose(); }}
              className={`absolute w-10 h-10 flex items-center justify-center text-xs font-bold rounded-full transition-colors ${
                currentTf === tf ? "text-white bg-[#0d47a1] shadow-lg scale-110" : "text-blue-100 hover:text-white"
              }`}
              style={{ transform: `translate(${x}px, ${y}px)` }}
            >
              {tf}
            </button>
          );
        })}

        <div className="absolute left-[-10px] top-1/2 -translate-y-1/2 flex flex-col gap-4 text-blue-200">
          <Crosshair size={18} />
          <BarChart2 size={18} />
          <Settings size={18} />
        </div>
      </div>
    </div>
  );
}