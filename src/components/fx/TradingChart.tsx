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
        if (!data || data.length === 0) return;

        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({
                    width: chartContainerRef.current.clientWidth,
                });
                chartRef.current.timeScale().fitContent();
            }
        };

        if (chartContainerRef.current) {
            const chart = createChart(chartContainerRef.current, {
                layout: {
                    background: {
                        type: ColorType.Solid,
                        color: backgroundColor,
                    },
                    textColor,
                },
                width: chartContainerRef.current.clientWidth,
                height: chartContainerRef.current.clientHeight || 280,

                grid: {
                    vertLines: {
                        color: 'rgba(255,255,255,0.03)',
                    },
                    horzLines: {
                        color: 'rgba(255,255,255,0.03)',
                    },
                },

                timeScale: {
                    timeVisible: true,
                    secondsVisible: true,
                    barSpacing: 6,
                    rightOffset: 5,
                    fixLeftEdge: true,
                    fixRightEdge: true,
                },

                rightPriceScale: {
                    borderVisible: false,
                    scaleMargins: {
                        top: 0.15,
                        bottom: 0.15,
                    },
                },
            });

            chartRef.current = chart;

            const newSeries = chart.addCandlestickSeries({
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: true,
                borderUpColor: '#26a69a',
                borderDownColor: '#ef5350',
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350',
            });

            seriesRef.current = newSeries;
            newSeries.setData(data);
            chart.timeScale().fitContent();

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

            if (chartRef.current) {
                chartRef.current.timeScale().fitContent();
            }
        }
    }, [data]);

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
            className="w-full h-[280px]"
        />
    );
};
