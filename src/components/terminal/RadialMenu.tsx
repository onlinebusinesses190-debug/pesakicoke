import { createElement, useState, useEffect } from "react";
import { Crosshair, Settings, BarChart2, MousePointer } from "lucide-react";
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

const BASE_VIEWPORT = 360;
const BASE_OUTER = 210;
const MAX_OUTER = 230;
const RING_THICKNESS = 27;
const LABEL_RADIUS_FACTOR = 91 / 105;
const TOUCH_TARGET = 36;
const BUBBLE_SIZE = 42;
const TOOL_ICON_SIZE = 21;

export function RadialMenu({
  isOpen, onClose, currentTf, onSelectTf,
  showCrosshair, setShowCrosshair,
  showIndicators, setShowIndicators,
  chartType, setChartType,
}: RadialMenuProps) {
  if (!isOpen) return null;

  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : BASE_VIEWPORT
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const scale = viewportWidth / BASE_VIEWPORT;
  const outerD = Math.min(MAX_OUTER, BASE_OUTER * scale);
  const outerR = outerD / 2;
  const ringThickness = RING_THICKNESS * scale;
  const innerD = outerD - ringThickness * 2;
  const labelR = outerR - ringThickness / 2;
  const CENTER = outerD / 2;

  // 0° = right, positive = clockwise (screen coordinates, y increases downward)
  const angleToCoord = (angle: number, radius: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: CENTER + Math.cos(rad) * radius,
      y: CENTER + Math.sin(rad) * radius,
    };
  };

  // Timeframes on upper/right arc
  const timeframes = [
    { label: "M5" as TF, angle: -110 },
    { label: "M15" as TF, angle: 0 },
    { label: "M30" as TF, angle: 35 },
    { label: "H4" as TF, angle: 65 },
    { label: "D1" as TF, angle: 90 },
    { label: "W1" as TF, angle: 215 },
    { label: "M1" as TF, angle: 245 }, // adjusted from 250° to avoid M5 collision
  ];

  // Chart tools on left/lower arc
  const tools = [
    { icon: MousePointer, label: "Object", angle: 225, onClick: () => { setShowIndicators(!showIndicators); onClose(); } },
    { icon: Settings, label: "Settings", angle: 200, onClick: () => { setShowIndicators(!showIndicators); onClose(); } },
    { icon: Crosshair, label: "Crosshair", angle: 155, onClick: () => { setShowCrosshair(!showCrosshair); onClose(); } },
    { icon: BarChart2, label: "Chart", angle: 125, onClick: () => { setChartType(chartType === "candle" ? "line" : "candle"); onClose(); } },
  ];

  const selectedTf = timeframes.find(t => t.label === currentTf);

  return (
    <div
      className="absolute z-[100] pointer-events-auto"
      style={{
        left: "68%",
        top: "68%",
        width: outerD,
        height: outerD,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Blue ring */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          borderWidth: ringThickness,
          borderColor: "#0F53FF",
          borderStyle: "solid",
          borderRadius: "50%",
          backgroundColor: "transparent",
          boxSizing: "border-box",
        }}
      />

      {/* Timeframe labels */}
      {timeframes.map((tf) => {
        const isSelected = tf.label === currentTf;
        const pos = angleToCoord(tf.angle, labelR);
        return (
          <button
            key={tf.label}
            onClick={() => { onSelectTf(tf.label); onClose(); }}
            className="absolute flex items-center justify-center font-semibold hover:opacity-80 transition-opacity"
            style={{
              left: pos.x - TOUCH_TARGET / 2,
              top: pos.y - TOUCH_TARGET / 2,
              width: TOUCH_TARGET,
              height: TOUCH_TARGET,
              fontSize: 12 * scale,
              fontWeight: 600,
              color: isSelected ? "white" : "rgba(255,255,255,0.7)",
              background: isSelected ? "#1456D9" : "transparent",
              border: "none",
              borderRadius: "50%",
              cursor: "pointer",
            }}
          >
            {tf.label}
          </button>
        );
      })}

      {/* Selected timeframe bubble - separate 42px element at anchor position */}
      {selectedTf && (
        (() => {
          const pos = angleToCoord(selectedTf.angle, labelR);
          return (
            <div
              className="absolute flex items-center justify-center rounded-full pointer-events-none"
              style={{
                left: pos.x,
                top: pos.y,
                width: BUBBLE_SIZE,
                height: BUBBLE_SIZE,
                background: "#1456D9",
                borderRadius: "50%",
                fontSize: 14 * scale,
                fontWeight: 700,
                color: "white",
                transform: "translate(-50%, -50%)",
                zIndex: 1,
              }}
              aria-hidden
            >
              {selectedTf.label}
            </div>
          );
        })()
      )}

      {/* Tool icons on left/lower arc */}
      {tools.map((tool) => {
        const pos = angleToCoord(tool.angle, labelR);
        return (
          <button
            key={tool.label}
            onClick={tool.onClick}
            className="absolute flex items-center justify-center rounded-full bg-white hover:bg-gray-100 transition-colors shadow-sm"
            style={{
              left: pos.x - TOUCH_TARGET / 2,
              top: pos.y - TOUCH_TARGET / 2,
              width: TOUCH_TARGET,
              height: TOUCH_TARGET,
              border: "none",
              borderRadius: "50%",
              cursor: "pointer",
            }}
            aria-label={tool.label}
          >
            {createElement(tool.icon, { size: TOOL_ICON_SIZE })}
          </button>
        );
      })}

      {/* Small close on tap-away via backdrop */}
      <div
        onClick={onClose}
        className="absolute inset-0 rounded-full"
        style={{ pointerEvents: "auto", background: "transparent" }}
      />
    </div>
  );
}
