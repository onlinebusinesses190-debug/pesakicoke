import { useEffect, useRef } from "react";
import { Crosshair, Settings, BarChart3, X } from "lucide-react";
import type { TF } from "@/lib/trading/engine";

const ALL_TIMEFRAMES: TF[] = ["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"];

interface RadialMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onSelect: (tf: TF) => void;
  currentTf: TF;
  position?: { x: number; y: number } | null;
}

const OUTER_RADIUS = 180;
const INNER_RADIUS = 110;

export function RadialMenu({ isOpen, onClose, onSelect, currentTf }: RadialMenuProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const itemAngle = ALL_TIMEFRAMES.length > 1 ? 360 / ALL_TIMEFRAMES.length : 0;

  useEffect(() => {
    if (!isOpen) return;
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", onEsc);
    return () => {
      document.body.style.overflow = "";
      document.removeEventListener("keydown", onEsc);
    };
  }, [isOpen, onClose]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current) onClose();
  };

  const handleCenterClick = () => onClose();

  const handleSelect = (tf: TF) => {
    onSelect(tf);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 animate-in fade-in-0"
      onClick={handleOverlayClick}
    >
      <div className="relative flex items-center justify-center animate-in zoom-in-95 duration-200">
        <div
          className="absolute z-10 flex h-32 w-32 items-center justify-center rounded-full border-4 border-[#1565c0]/30 bg-[#1565c0] shadow-2xl shadow-[#1565c0]/60 transition-transform duration-200 hover:scale-110"
          onClick={handleCenterClick}
        />

        <div
          className="absolute z-0 rounded-full border-2 border-[#1565c0] shadow-xl shadow-[#1565c0]/50"
          style={{
            width: OUTER_RADIUS * 2,
            height: OUTER_RADIUS * 2,
          }}
        >
          {ALL_TIMEFRAMES.map((tf, i) => {
            const angleDeg = i * itemAngle - 90;
            const angleRad = (angleDeg * Math.PI) / 180;
            const rx = Math.cos(angleRad) * OUTER_RADIUS;
            const ry = Math.sin(angleRad) * OUTER_RADIUS;
            const isSelected = tf === currentTf;
            return (
              <button
                key={tf}
                type="button"
                onClick={() => handleSelect(tf)}
                className={`absolute flex h-12 w-12 items-center justify-center rounded-full text-xs font-bold transition-all duration-200 ${
                  isSelected
                    ? "scale-125 bg-[#1565c0] text-white shadow-lg shadow-[#1565c0]/70"
                    : "bg-slate-800 text-slate-300 hover:scale-125 hover:bg-[#1565c0] hover:text-white"
                }`}
                style={{ left: `calc(50% + ${rx}px - 24px)`, top: `calc(50% + ${ry}px - 24px)` }}
              >
                {tf}
              </button>
            );
          })}
        </div>

        <div className="absolute -left-16 top-1/2 -translate-y-1/2 flex flex-col gap-3">
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:scale-110 hover:bg-[#1565c0] hover:text-white transition-all duration-200"
            title="Crosshair"
          >
            <Crosshair size={20} />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:scale-110 hover:bg-[#1565c0] hover:text-white transition-all duration-200"
            title="Indicators"
          >
            <BarChart3 size={20} />
          </button>
          <button
            type="button"
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-300 hover:scale-110 hover:bg-[#1565c0] hover:text-white transition-all duration-200"
            title="Settings"
          >
            <Settings size={20} />
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-800 text-slate-400 hover:scale-110 hover:bg-red-600 hover:text-white transition-all duration-200 mt-6"
            title="Close"
          >
            <X size={20} />
          </button>
        </div>
      </div>
    </div>
  );
}
