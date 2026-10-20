import { createElement } from "react";
import {
  X, Crosshair, Settings, BarChart2, MousePointer, Sliders,
} from "lucide-react";
import type { TF } from "@/lib/trading/engine";

interface RadialMenuProps {
  isOpen: boolean;
  onClose: () => void;
  currentTf: TF;
  onSelectTf: (tf: TF) => void;
  showCrosshair: boolean;
  setShowCrosshair: (v: boolean) => void;
  showIndicators: boolean;
  setShowIndicators: (v: boolean) => void;
}

const CENTER = 140;
const RADIUS = 116;

function angleToCoord(angleDeg: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return {
    x: CENTER + Math.cos(rad) * RADIUS,
    y: CENTER + Math.sin(rad) * RADIUS,
  };
}

export function RadialMenu({
  isOpen, onClose, currentTf, onSelectTf,
  showCrosshair, setShowCrosshair,
  showIndicators, setShowIndicators,
}: RadialMenuProps) {
  if (!isOpen) return null;

  const items = [
    { type: "text" as const, label: "M5" as TF,  angle: 0 },
    { type: "text" as const, label: "M15" as TF, angle: 1 },
    { type: "text" as const, label: "M30" as TF, angle: 2 },
    { type: "text" as const, label: "H1" as TF,  angle: 3 },
    { type: "text" as const, label: "H4" as TF,  angle: 4 },
    { type: "text" as const, label: "D1" as TF,  angle: 5 },
    { type: "icon" as const, icon: BarChart2,    label: "Chart Settings", angle: 6, onClick: () => onClose() },
    { type: "icon" as const, icon: MousePointer,  label: "Object Properties", angle: 7, onClick: () => onClose() },
    { type: "icon" as const, icon: Sliders,       label: "Indicators", angle: 8, onClick: () => { setShowIndicators(!showIndicators); onClose(); } },
    { type: "icon" as const, icon: Crosshair,    label: "Magnet / Crosshair", angle: 9, onClick: () => { setShowCrosshair(!showCrosshair); onClose(); } },
  ];

  const angleFor = (index: number) => -90 + index * 36;

  return (
    <div className="absolute inset-0 z-[100] flex items-center justify-center">
      <div
        className="relative flex items-center justify-center rounded-full"
        style={{
          width: 280,
          height: 280,
          left: "50%",
          top: "55%",
          transform: "translate(-50%, -50%)",
          borderWidth: 22,
          borderColor: "#0F53FF",
          borderStyle: "solid",
          borderRadius: "50%",
          backgroundColor: "transparent",
          boxSizing: "border-box",
          boxShadow: "none",
        }}
      >
        <button
          onClick={onClose}
          className="absolute flex items-center justify-center rounded-full transition-colors"
          style={{
            width: 60,
            height: 60,
            left: CENTER - 30,
            top: CENTER - 30,
            backgroundColor: "rgba(255, 255, 255, 0.9)",
            border: "none",
            cursor: "pointer",
          }}
        >
          <X size={18} />
        </button>

        {items.map((item, index) => {
          const angle = angleFor(item.angle);
          const pos = angleToCoord(angle);
          const isSelected = item.type === "text" && item.label === currentTf;
          return (
            <button
              key={item.label}
              type="button"
              onClick={item.type === "text"
                ? () => { onSelectTf(item.label); onClose(); }
                : item.onClick}
              className="absolute flex items-center justify-center font-semibold text-white hover:text-blue-200 transition-colors"
              style={{
                left: pos.x - 18,
                top: pos.y - 18,
                width: 36,
                height: 36,
                background: isSelected ? "#0d47a1" : "transparent",
                border: "none",
                borderRadius: "50%",
                fontSize: "14px",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {item.type === "icon" ? createElement(item.icon, { size: 20 }) : item.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
