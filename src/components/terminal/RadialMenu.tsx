import {
  X, Crosshair, Settings, BarChart2,
} from "lucide-react";
import { useRef, useState, useEffect } from "react";
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
  chartType: "candle" | "line";
  setChartType: (v: "candle" | "line") => void;
}

const TIMEFRAME_ANGLE: Record<string, number> = {
  M1: -95, M5: -55, M15: 0, M30: 38, H1: 90, H4: 68, D1: 105, W1: -145,
};

function angleToCoord(angleDeg: number, radius: number, cx: number, cy: number) {
  const rad = (angleDeg * Math.PI) / 180;
  return { x: cx + Math.cos(rad) * radius, y: cy + Math.sin(rad) * radius };
}

export function RadialMenu({
  isOpen, onClose, currentTf, onSelectTf,
  showCrosshair, setShowCrosshair,
  showIndicators, setShowIndicators,
  chartType, setChartType,
}: RadialMenuProps) {
  if (!isOpen) return null;

  const containerRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState({ w: 360, h: 400 });

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => {
      const r = el.getBoundingClientRect();
      setDims({ w: r.width, h: r.height });
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const chartW = dims.w;
  const chartH = dims.h;

  const outerD = Math.min(chartW * 0.57, 260);
  const innerD = outerD * 0.74;
  const ringThickness = (outerD - innerD) / 2;
  const radius = outerD / 2;
  const centerX = chartW * 0.68;
  const centerY = chartH * 0.68;
  const btnSize = 40;
  const iconBtnSize = 44;
  const centerBtnSize = 52;

  const at = (angle: number, r: number) => angleToCoord(angle, r, centerX, centerY);

  const handleSelect = (tf: TF) => {
    onSelectTf(tf);
    onClose();
  };

  const allTimeframes = Object.keys(TIMEFRAME_ANGLE);

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[100] cursor-pointer"
      onClick={onClose}
    >
      <div className="absolute pointer-events-auto" onClick={(e) => e.stopPropagation()}>
        <div
          className="rounded-full border-[#1456D9]"
          style={{
            position: "absolute",
            left: centerX - outerD / 2,
            top: centerY - outerD / 2,
            width: outerD,
            height: outerD,
            borderWidth: ringThickness,
            boxSizing: "border-box",
            background: "transparent",
            borderRadius: "50%",
          }}
        />

        {allTimeframes.map((tf) => {
          const angle = TIMEFRAME_ANGLE[tf];
          const pos = at(angle, radius);
          const isSelected = tf === currentTf;
          const scale = isSelected ? 1.3 : 1;
          return (
            <button
              key={tf}
              type="button"
              onClick={() => handleSelect(tf as TF)}
              className={`absolute flex items-center justify-center font-semibold transition-all ${
                isSelected
                  ? "text-white bg-[#1456D9] shadow-lg pointer-events-none"
                  : "text-blue-100 hover:text-white hover:bg-[#1456D9] hover:shadow-lg"
              }`}
              style={{
                left: pos.x - btnSize / 2,
                top: pos.y - btnSize / 2,
                width: btnSize,
                height: btnSize,
                borderRadius: "50%",
                fontSize: "14px",
                transform: `scale(${scale})`,
                border: "none",
                cursor: isSelected ? "default" : "pointer",
              }}
            >
              {tf}
            </button>
          );
        })}

        <button
          type="button"
          onClick={() => { setShowCrosshair(!showCrosshair); onClose(); }}
          className={`absolute flex items-center justify-center transition-all ${
            showCrosshair ? "text-[#00d4ff] scale-125" : "text-blue-100 hover:text-white hover:scale-110"
          }`}
          style={{
            left: at(155, radius).x - iconBtnSize / 2,
            top: at(155, radius).y - iconBtnSize / 2,
            width: iconBtnSize,
            height: iconBtnSize,
            borderRadius: "50%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          title="Crosshair"
        >
          <Crosshair size={23} />
        </button>

        <button
          type="button"
          onClick={() => { setShowIndicators(!showIndicators); onClose(); }}
          className={`absolute flex items-center justify-center transition-all ${
            showIndicators ? "text-[#00d4ff] scale-125" : "text-blue-100 hover:text-white hover:scale-110"
          }`}
          style={{
            left: at(125, radius).x - iconBtnSize / 2,
            top: at(125, radius).y - iconBtnSize / 2,
            width: iconBtnSize,
            height: iconBtnSize,
            borderRadius: "50%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          title="Indicators"
        >
          <BarChart2 size={23} />
        </button>

        <button
          type="button"
          onClick={() => { setShowIndicators(true); onClose(); }}
          className="absolute flex items-center justify-center text-blue-100 hover:text-white hover:scale-110 transition-all"
          style={{
            left: at(195, radius).x - iconBtnSize / 2,
            top: at(195, radius).y - iconBtnSize / 2,
            width: iconBtnSize,
            height: iconBtnSize,
            borderRadius: "50%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          title="Settings"
        >
          <Settings size={23} />
        </button>

        <button
          type="button"
          onClick={() => { setChartType(chartType === "candle" ? "line" : "candle"); onClose(); }}
          className={`absolute flex items-center justify-center transition-all ${
            chartType === "line" ? "text-[#00d4ff] scale-125" : "text-blue-100 hover:text-white hover:scale-110"
          }`}
          style={{
            left: at(225, radius).x - iconBtnSize / 2,
            top: at(225, radius).y - iconBtnSize / 2,
            width: iconBtnSize,
            height: iconBtnSize,
            borderRadius: "50%",
            background: "transparent",
            border: "none",
            cursor: "pointer",
          }}
          title="Chart type"
        >
          <BarChart2 size={23} />
        </button>

        <button
          type="button"
          onClick={onClose}
          className="absolute flex items-center justify-center text-blue-100 hover:text-white hover:bg-[#1456D9] transition-all"
          style={{
            left: centerX - centerBtnSize / 2,
            top: centerY - centerBtnSize / 2,
            width: centerBtnSize,
            height: centerBtnSize,
            borderRadius: "50%",
            background: "transparent",
            border: "1px solid rgba(170, 200, 255, 0.3)",
            cursor: "pointer",
          }}
          title="Close"
        >
          <X size={22} />
        </button>
      </div>
    </div>
  );
}
