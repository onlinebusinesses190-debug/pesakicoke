import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts'
import { useEffect, useRef } from 'react'

export const TradingChart = ({
    data,
    colors: {
        backgroundColor = 'transparent',
        lineColor = '#2962FF',
        textColor = 'silver',
        areaTopColor = '#2962FF',
        areaBottomColor = 'rgba(41, 98, 255, 0.28)',
    } = {}
}: { data: any[], colors?: any }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null)
    const chartRef = useRef<IChartApi | null>(null)
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null)

    useEffect(() => {
        const handleResize = () => {
            if (chartRef.current && chartContainerRef.current) {
                chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth })
            }
        }

        if (chartContainerRef.current) {
            const chart = createChart(chartContainerRef.current, {
                layout: {
                    background: { type: ColorType.Solid, color: backgroundColor },
                    textColor,
                },
                width: chartContainerRef.current.clientWidth,
                height: chartContainerRef.current.clientHeight || 500,
                grid: {
                    vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                    horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: true,
                }
            })
            chartRef.current = chart

            const newSeries = chart.addSeries(CandlestickSeries, {
                upColor: '#26a69a',
                downColor: '#ef5350',
                borderVisible: false,
                wickUpColor: '#26a69a',
                wickDownColor: '#ef5350'
            })
            seriesRef.current = newSeries
            newSeries.setData(data)

            window.addEventListener('resize', handleResize)

            return () => {
                window.removeEventListener('resize', handleResize)
                chart.remove()
            }
        }
    }, [backgroundColor, lineColor, textColor, areaTopColor, areaBottomColor, data])

    useEffect(() => {
        if (seriesRef.current) {
            seriesRef.current.setData(data);
        }
    }, [data]);

    return (
        <div
            ref={chartContainerRef}
            className="w-full h-[500px]"
        />
    )
}
