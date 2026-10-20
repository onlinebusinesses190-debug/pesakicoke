import { createElement, useState, useEffect } from "react";
import {
  X, Crosshair, Sliders, Activity, Search, Copy,
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

const OUTER_R = 110;
const INNER_R = 65;
const DIAMETER = OUTER_R * 2;
const RING = OUTER_R - INNER_R;
const SLOT_COUNT = 14;
const START_ANGLE = -130;

const slotAngle = (i: number) => START_ANGLE + i * (360 / SLOT_COUNT);

interface ToolSlot {
  icon: React.ComponentType<any>;
  label: string;
  angle: number;
  onClick: () => void;
}

export function RadialMenu({
  isOpen, onClose, currentTf, onSelectTf,
  showCrosshair, setShowCrosshair,
  showIndicators, setShowIndicators,
}: RadialMenuProps) {
  if (!isOpen) return null;

  const [viewportWidth, setViewportWidth] = useState(
    typeof window !== "undefined" ? window.innerWidth : 360
  );

  useEffect(() => {
    const handleResize = () => setViewportWidth(window.innerWidth);
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const scale = Math.min(1.15, Math.max(0.75, viewportWidth / 360));
  const d = DIAMETER * scale;
  const cx = OUTER_R * scale;
  const cy = OUTER_R * scale;
  const outerR = OUTER_R * scale;
  const ringThickness = RING * scale;
  const midRingR = ((OUTER_R + INNER_R) / 2) * scale;
  const touchSize = 40 * scale;

  const toCoord = (angle: number, radius: number) => {
    const rad = (angle * Math.PI) / 180;
    return {
      x: cx + Math.cos(rad) * radius,
      y: cy + Math.sin(rad) * radius,
    };
  };

  const tfSlots = [
    { label: "M1",  tf: "M1" as TF,  angle: slotAngle(0) },
    { label: "M5",  tf: "M5" as TF,  angle: slotAngle(1) },
    { label: "M15", tf: "M15" as TF, angle: slotAngle(2) },
    { label: "M30", tf: "M30" as TF, angle: slotAngle(3) },
    { label: "H1",  tf: "H1" as TF,  angle: slotAngle(4) },
    { label: "H4",  tf: "H4" as TF, angle: slotAngle(5) },
    { label: "D1",  tf: "D1" as TF, angle: slotAngle(6) },
    { label: "LM",  tf: undefined as TF | undefined, angle: slotAngle(7) },
    { label: "NW",  tf: undefined as TF | undefined, angle: slotAngle(8) },
  ];

  const tools: ToolSlot[] = [
    { icon: Activity,  label: "Indicators",  angle: slotAngle(9),  onClick: () => { setShowIndicators(!showIndicators); onClose(); } },
    { icon: Crosshair, label: "Crosshair",   angle: slotAngle(10), onClick: () => { setShowCrosshair(!showCrosshair); onClose(); } },
    { icon: Sliders,   label: "Settings",    angle: slotAngle(11), onClick: () => { setShowIndicators(!showIndicators); onClose(); } },
    { icon: Search,    label: "Finder",      angle: slotAngle(12), onClick: onClose },
    { icon: Copy,      label: "Duplicate",   angle: slotAngle(13), onClick: onClose },
  ];

  return (
    <div
      className="absolute z-[100] pointer-events-auto"
      style={{
        left: "68%",
        top: "68%",
        width: d,
        height: d,
        transform: "translate(-50%, -50%)",
      }}
    >
      {/* Donut ring: blue border with transparent center shows chart behind */}
      <div
        className="absolute inset-0 rounded-full"
        style={{
          borderRadius: "50%",
          border: `${ringThickness}px solid #3A86FF`,
          backgroundColor: "transparent",
          boxSizing: "border-box",
          width: d,
          height: d,
        }}
      />

      {/* Timeframe labels on mid-ring arc */}
      {tfSlots.map((tf) => {
        const pos = toCoord(tf.angle, midRingR);
        const rotations: Record<string, string> = {
          M1: "rotate(-40deg)", M5: "rotate(-20deg)", M15: "rotate(0deg)",
          M30: "rotate(20deg)", H1: "rotate(45deg)", H4: "rotate(70deg)",
          D1: "rotate(75deg)", LM: "rotate(60deg)", NW: "rotate(30deg)",
        };
        return (
          <button
            key={tf.label}
            onClick={tf.tf ? () => { onSelectTf(tf.tf!); onClose(); } : undefined}
            disabled={!tf.tf}
            className="absolute flex items-center justify-center font-bold text-white hover:opacity-80 transition-opacity"
            style={{
              left: pos.x,
              top: pos.y,
              width: touchSize,
              height: touchSize,
              fontSize: 12 * scale,
              fontWeight: 700,
              color: "#FFFFFF",
              background: "transparent",
              border: "none",
              borderRadius: "50%",
              cursor: tf.tf ? "pointer" : "default",
              transform: `translate(-50%, -50%) ${rotations[tf.label] || "rotate(0deg)"}`,
              WebkitTextStroke: "2.5px black",
              paintOrder: "stroke",
            }}
          >
            {tf.label}
          </button>
        );
      })}

      {/* Tool icons on lower-left arc - white line strokes only, no background circles */}
      {tools.map((tool) => {
        const pos = toCoord(tool.angle, midRingR);
        return (
          <button
            key={tool.label}
            onClick={tool.onClick}
            className="absolute flex items-center justify-center transition-opacity hover:opacity-80"
            style={{
              left: pos.x,
              top: pos.y,
              width: touchSize,
              height: touchSize,
              border: "none",
              borderRadius: "50%",
              cursor: "pointer",
              background: "transparent",
              transform: "translate(-50%, -50%)",
            }}
            aria-label={tool.label}
          >
            {createElement(tool.icon, { size: 18 * scale, color: "#ffffff", strokeWidth: 1.6 })}
          </button>
        );
      })}

      {/* Center close button - small white X, 20px */}
      <button
        onClick={onClose}
        className="absolute flex items-center justify-center text-white hover:opacity-70 transition-opacity"
        style={{
          left: cx,
          top: cy,
          width: 20 * scale,
          height: 20 * scale,
          transform: "translate(-50%, -50%)",
          border: "none",
          background: "transparent",
          cursor: "pointer",
          padding: 0,
        }}
        aria-label="Close"
      >
        <X size={14 * scale} />
      </button>
    </div>
  );
}
