import {
  createChart,
  ColorType,
  IChartApi,
  ISeriesApi,
  IPriceLine,
  LineStyle,
  LineWidth,
} from "lightweight-charts";
import { useEffect, useRef } from "react";

export type FxMarker = {
  id: string;
  time: number;
  price: number;
  type: "buy" | "sell";
  stake: number;
  status: "pending" | "won" | "lost";
  remainingSeconds: number;
  expiresAt: number;
  label?: string;
};

export type Theme = "light" | "dark";

export interface ForexChartProps {
  data: any[];
  markers?: FxMarker[];
  colors?: { backgroundColor?: string; textColor?: string };
  theme?: Theme;
  currentPrice?: number;
  tp?: number;
  sl?: number;
  pnl?: number;
  onMarkerPosition?: (coords: { id: string; x: number; y: number }[]) => void;
  onTpChange?: (price: number) => void;
  onSlChange?: (price: number) => void;
  pairDigits?: number;
}

const themeColors = {
  light: {
    background: "#ffffff",
    textColor: "#1a1a2e",
    grid: "rgba(26, 26, 46, 0.12)",
    upColor: "#26a69a",
    downColor: "#ef5350",
    priceLine: "#2563eb",
    tpColor: "#16a34a",
    slColor: "#dc2626",
  },
  dark: {
    background: "#0b0e14",
    textColor: "#7a82a8",
    grid: "rgba(255, 255, 255, 0.05)",
    upColor: "#26a69a",
    downColor: "#ef5350",
    priceLine: "#4a90d9",
    tpColor: "#22c55e",
    slColor: "#ef4444",
  },
};

export const ForexChart = ({
  data,
  markers = [],
  colors: { backgroundColor, textColor } = {},
  theme = "light",
  currentPrice,
  tp,
  sl,
  onMarkerPosition,
  onTpChange,
  onSlChange,
  pairDigits = 5,
}: ForexChartProps) => {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const priceLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const draggingRef = useRef<{
    type: "tp" | "sl" | null;
    startPrice: number;
    startMouseY: number;
  } | null>(null);

  const colorsRef = useRef<typeof themeColors.light>(
    theme === "light" ? themeColors.light : themeColors.dark
  );
  const effectiveColors =
    backgroundColor !== undefined || textColor !== undefined
      ? {
          ...colorsRef.current,
          background: backgroundColor || colorsRef.current.background,
          textColor: textColor || colorsRef.current.textColor,
        }
      : colorsRef.current;

  useEffect(() => {
    if (!data || data.length === 0) return;

    const handleResize = () => {
      if (chartRef.current && chartContainerRef.current) {
        chartRef.current.applyOptions({
          width: chartContainerRef.current.clientWidth,
          height: chartContainerRef.current.clientHeight || 400,
        });
        chartRef.current.timeScale().fitContent();
      }
    };

    if (chartContainerRef.current) {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: effectiveColors.background },
          textColor: effectiveColors.textColor,
          fontSize: 10,
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight || 400,
        grid: {
          vertLines: { color: effectiveColors.grid, style: LineStyle.Dotted },
          horzLines: { color: effectiveColors.grid, style: LineStyle.Dotted },
        },
        timeScale: {
          timeVisible: true,
          secondsVisible: false,
          borderVisible: false,
          barSpacing: 2,
        },
        rightPriceScale: {
          scaleMargins: { top: 0.05, bottom: 0.05 },
          borderVisible: false,
        },
        crosshair: {
          mode: 0,
          vertLine: {
            color: effectiveColors.grid,
            width: 1 as LineWidth,
            style: LineStyle.Dashed,
            labelVisible: true,
          },
          horzLine: {
            color: effectiveColors.grid,
            width: 1 as LineWidth,
            style: LineStyle.Dashed,
            labelVisible: true,
          },
        },
      });

      chartRef.current = chart;

      const newSeries = chart.addCandlestickSeries({
        upColor: effectiveColors.upColor,
        downColor: effectiveColors.downColor,
        borderVisible: false,
        wickUpColor: effectiveColors.upColor,
        wickDownColor: effectiveColors.downColor,
        priceLineVisible: false,
        lastValueVisible: false,
        priceScaleId: "",
      });

      seriesRef.current = newSeries;
      newSeries.setData(data);

      // Tight auto-scaling: shrink price margins so candles hug the visible range
      if (chartRef.current) {
        chartRef.current.priceScale("right").applyOptions({
          scaleMargins: { top: 0.05, bottom: 0.05 },
          autoScale: true,
        });
      }
      chart.timeScale().fitContent();

      window.addEventListener("resize", handleResize);

      return () => {
        window.removeEventListener("resize", handleResize);
        chart.remove();
      };
    }
  }, [data, effectiveColors]);

  useEffect(() => {
    if (seriesRef.current && data && data.length > 0) {
      seriesRef.current.setData(data);
      if (chartRef.current) {
        chartRef.current.timeScale().fitContent();
      }
    }
  }, [data]);

  useEffect(() => {
    if (!seriesRef.current) return;

    if (markers.length > 0) {
      const lcMarkers = markers.map((m) => {
        const isBuy = m.type === "buy";
        const position: "belowBar" | "aboveBar" = isBuy ? "belowBar" : "aboveBar";
        const shape: "arrowUp" | "arrowDown" = isBuy ? "arrowUp" : "arrowDown";
        const color =
          m.status === "won"
            ? "#22c55e"
            : m.status === "lost"
            ? "#ef4444"
            : isBuy
            ? "#22c55e"
            : "#ef4444";
        const text = m.status === "won" ? "W" : m.status === "lost" ? "L" : undefined;
        return { time: m.time as any, position, color, shape, text, size: 1 };
      });
      seriesRef.current.setMarkers(lcMarkers);
    } else {
      seriesRef.current.setMarkers([]);
    }
  }, [markers]);

  useEffect(() => {
    if (markers.length === 0 || !chartRef.current || !seriesRef.current) return;

    let cancelled = false;
    const tick = () => {
      if (cancelled) return;
      const chart = chartRef.current;
      const series = seriesRef.current;
      if (!chart || !series) return;

      const coords: { id: string; x: number; y: number }[] = [];
      for (const m of markers) {
        const x = chart.timeScale().timeToCoordinate(m.time as any);
        const y = series.priceToCoordinate(m.price);
        if (x != null && y != null) {
          coords.push({ id: m.id, x, y });
        }
      }
      onMarkerPosition?.(coords);
      requestAnimationFrame(tick);
    };
    const id = requestAnimationFrame(tick);
    return () => {
      cancelled = true;
      cancelAnimationFrame(id);
    };
  }, [markers, onMarkerPosition]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (currentPrice === undefined) {
      if (priceLineRef.current) {
        seriesRef.current.removePriceLine(priceLineRef.current);
        priceLineRef.current = null;
      }
      return;
    }

    if (priceLineRef.current) {
      seriesRef.current.removePriceLine(priceLineRef.current);
    }

    const line = seriesRef.current.createPriceLine({
      price: currentPrice,
      color: effectiveColors.priceLine,
      lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: false,
      title: "Price",
    });
    priceLineRef.current = line;

    return () => {
      if (line && seriesRef.current) {
        seriesRef.current.removePriceLine(line);
      }
    };
  }, [currentPrice, effectiveColors.priceLine]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (tp === undefined) {
      if (tpLineRef.current) {
        seriesRef.current.removePriceLine(tpLineRef.current);
        tpLineRef.current = null;
      }
      return;
    }

    if (tpLineRef.current) {
      seriesRef.current.removePriceLine(tpLineRef.current);
    }

    const line = seriesRef.current.createPriceLine({
      price: tp,
      color: effectiveColors.tpColor,
      lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: true,
      title: `TP ${tp.toFixed(pairDigits)}`,
    });
    tpLineRef.current = line;

    return () => {
      if (line && seriesRef.current) {
        seriesRef.current.removePriceLine(line);
      }
    };
  }, [tp, effectiveColors.tpColor, pairDigits]);

  useEffect(() => {
    if (!seriesRef.current) return;
    if (sl === undefined) {
      if (slLineRef.current) {
        seriesRef.current.removePriceLine(slLineRef.current);
        slLineRef.current = null;
      }
      return;
    }

    if (slLineRef.current) {
      seriesRef.current.removePriceLine(slLineRef.current);
    }

    const line = seriesRef.current.createPriceLine({
      price: sl,
      color: effectiveColors.slColor,
      lineWidth: 1 as LineWidth,
      lineStyle: LineStyle.Dashed,
      lineVisible: true,
      axisLabelVisible: true,
      title: `SL ${sl.toFixed(pairDigits)}`,
    });
    slLineRef.current = line;

    return () => {
      if (line && seriesRef.current) {
        seriesRef.current.removePriceLine(line);
      }
    };
  }, [sl, effectiveColors.slColor, pairDigits]);

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container) return;

    const handleMouseDown = (e: MouseEvent) => {
      if (!seriesRef.current) return;
      const rect = container.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;

      if (tp !== undefined && onTpChange) {
        const tpY = seriesRef.current.priceToCoordinate(tp);
        if (tpY !== null && Math.abs(mouseY - tpY) < 12) {
          draggingRef.current = { type: "tp", startPrice: tp, startMouseY: mouseY };
          container.style.cursor = "ns-resize";
          return;
        }
      }

      if (sl !== undefined && onSlChange) {
        const slY = seriesRef.current.priceToCoordinate(sl);
        if (slY !== null && Math.abs(mouseY - slY) < 12) {
          draggingRef.current = { type: "sl", startPrice: sl, startMouseY: mouseY };
          container.style.cursor = "ns-resize";
          return;
        }
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (!draggingRef.current || !seriesRef.current) return;
      const rect = container.getBoundingClientRect();
      const mouseY = e.clientY - rect.top;
      const deltaY = draggingRef.current.startMouseY - mouseY;

      const series = seriesRef.current;
      const y1 = series.priceToCoordinate(draggingRef.current.startPrice);
      const step = 0.001;
      const y2 = y1 !== null ? series.priceToCoordinate(draggingRef.current.startPrice + step) : null;
      if (y1 !== null && y2 !== null && y2 !== y1) {
        const pricePerPx = step / Math.abs(y2 - y1);
        const newPrice = draggingRef.current.startPrice + deltaY * pricePerPx;

        if (draggingRef.current.type === "tp") {
          onTpChange?.(newPrice);
        } else {
          onSlChange?.(newPrice);
        }
      }
    };

    const handleMouseUp = () => {
      if (draggingRef.current) {
        container.style.cursor = "";
        draggingRef.current = null;
      }
    };

    container.addEventListener("mousedown", handleMouseDown);
    container.addEventListener("mousemove", handleMouseMove);
    container.addEventListener("mouseup", handleMouseUp);
    container.addEventListener("mouseleave", handleMouseUp);

    return () => {
      container.removeEventListener("mousedown", handleMouseDown);
      container.removeEventListener("mousemove", handleMouseMove);
      container.removeEventListener("mouseup", handleMouseUp);
      container.removeEventListener("mouseleave", handleMouseUp);
    };
  }, [tp, sl, onTpChange, onSlChange]);

  if (!data || data.length === 0) {
    return (
      <div
        className="w-full h-full flex items-center justify-center text-gray-500 text-sm"
        style={{ backgroundColor: effectiveColors.background }}
      >
        Loading chart data...
      </div>
    );
  }

  return <div ref={chartContainerRef} className="w-full h-full relative" />;
};
