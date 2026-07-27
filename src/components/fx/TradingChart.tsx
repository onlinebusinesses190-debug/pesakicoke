import { createChart, ColorType, IChartApi, ISeriesApi } from 'lightweight-charts';
import { useEffect, useRef } from 'react';

export const TradingChart = ({
    data,
    colors: {
        backgroundColor = 'transparent',
        textColor = 'silver',
    } = {}
}: { data: any[], colors?: any }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    useEffect(() => {
        if (!data || data.length === 0) return; // ⬅️ Skip if no data

        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };

        if (chartContainerRef.current) {
            const chart = createChart(chartContainerRef.current, {
                layout: {
                    background: { type: ColorType.Solid, color: backgroundColor },
                    textColor,
                },
                width: chartContainerRef.current.clientWidth,
                height: chartContainerRef.current.clientHeight || 280, // ⬅️ Smaller height
                grid: {
                    vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                    horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: true,
                }
            });
            chartRef.current = chart;

            const newSeries = chart.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350'
            });
            seriesRef.current = newSeries;
            newSeries.setData(data);

            window.addEventListener('resize', handleResize);

            return () => {
                window.removeEventListener('resize', handleResize);
                chart.remove();
            };
        }
    }, [backgroundColor, textColor, data]);

    useEffect(() => {
        if (seriesRef.current && data && data.length > 0) {
            seriesRef.current.setData(data);
        }
    }, [data]);

    // ⬅️ Show fallback if no data
    if (!data || data.length === 0) {
        return (
            <div className="w-full h-[280px] flex items-center justify-center text-gray-500 text-sm bg-[#151924] rounded-xl">
                Loading chart data...
            </div>
        );
    }

    return (
        <div
            ref={chartContainerRef}
            className="w-full h-[280px]" // ⬅️ Smaller height
        />
    );
};
