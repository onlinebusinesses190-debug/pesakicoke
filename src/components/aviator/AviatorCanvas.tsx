'use client'

import React, { useRef, useEffect, useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface AviatorCanvasProps {
    multiplier: number
    gameState: 'WAITING' | 'FLYING' | 'CRASHED'
    roundHistory: number[]
}

export function AviatorCanvas({
    multiplier,
    gameState,
    roundHistory
}: AviatorCanvasProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const [dimensions, setDimensions] = useState({ width: 800, height: 400 })

    // Sync dimensions with container
    useEffect(() => {
        const updateDimensions = () => {
            if (containerRef.current) {
                const { width, height } = containerRef.current.getBoundingClientRect()
                setDimensions({ width, height })
            }
        }
        updateDimensions()
        window.addEventListener('resize', updateDimensions)
        return () => window.removeEventListener('resize', updateDimensions)
    }, [])

    // Drawer Effect
    useEffect(() => {
        const canvas = canvasRef.current
        if (!canvas) return
        const ctx = canvas.getContext('2d')
        if (!ctx) return

        const dpr = window.devicePixelRatio || 1
        canvas.width = dimensions.width * dpr
        canvas.height = dimensions.height * dpr
        ctx.scale(dpr, dpr)

        let animationFrameId: number

        const render = () => {
            const { width, height } = dimensions
            ctx.clearRect(0, 0, width, height)

            // 1. Draw Subtle Grid (Background)
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)'
            ctx.lineWidth = 1
            for (let x = 0; x <= width; x += 50) {
                ctx.beginPath()
                ctx.moveTo(x, 0)
                ctx.lineTo(x, height)
                ctx.stroke()
            }
            for (let y = 0; y <= height; y += 50) {
                ctx.beginPath()
                ctx.moveTo(0, y)
                ctx.lineTo(width, y)
                ctx.stroke()
            }

            // 2. Calculate Curve Position
            // Normalize Progress: (x: 0->width, y: height->0)
            // We use an exponential curve: y = a * x^b
            const rawProgress = Math.max(0, (multiplier - 1) / 10) // normalized relative to 10x
            const progress = 1 - Math.exp(-rawProgress * 2) // smooth easing
            
            const margin = 40
            const curveX = margin + (width - margin * 2) * progress
            const curveY = height - margin - (height - margin * 2) * Math.pow(progress, 1.5)

            // 3. Draw Red Wedge Fill (#cc1033)
            if (gameState === 'FLYING' || gameState === 'CRASHED') {
                ctx.beginPath()
                ctx.moveTo(margin, height - margin)
                
                // Curve Path for Fill
                for (let x = margin; x <= curveX; x += 5) {
                    const p = (x - margin) / (width - margin * 2)
                    const y = height - margin - (height - margin * 2) * Math.pow(p, 1.5)
                    ctx.lineTo(x, y)
                }
                
                ctx.lineTo(curveX, height - margin)
                ctx.closePath()
                ctx.fillStyle = gameState === 'CRASHED' ? '#800a20' : '#cc1033'
                ctx.fill()

                // 4. Draw The Curve Line (#ff1744)
                ctx.beginPath()
                ctx.lineWidth = 4
                ctx.strokeStyle = '#ff1744'
                ctx.lineCap = 'round'
                ctx.moveTo(margin, height - margin)
                
                for (let x = margin; x <= curveX; x += 5) {
                    const p = (x - margin) / (width - margin * 2)
                    const y = height - margin - (height - margin * 2) * Math.pow(p, 1.5)
                    ctx.lineTo(x, y)
                }
                ctx.stroke()
            }

            if (gameState === 'FLYING') {
                animationFrameId = requestAnimationFrame(render)
            }
        }

        render()
        return () => cancelAnimationFrame(animationFrameId)
    }, [multiplier, gameState, dimensions])

    // Plane Rotation Logic
    const planeTransform = useMemo(() => {
        const rawProgress = Math.max(0, (multiplier - 1) / 10)
        const progress = 1 - Math.exp(-rawProgress * 2)
        const margin = 40
        const x = margin + (dimensions.width - margin * 2) * progress
        const y = dimensions.height - margin - (dimensions.height - margin * 2) * Math.pow(progress, 1.5)
        
        // Slope estimate for rotation
        const nextP = Math.min(1, progress + 0.01)
        const nextY = dimensions.height - margin - (dimensions.height - margin * 2) * Math.pow(nextP, 1.5)
        const angle = Math.atan2(nextY - y, (dimensions.width - margin * 2) * 0.01)
        
        return { x, y, angle: angle * (180 / Math.PI) }
    }, [multiplier, dimensions])

    return (
        <div 
            ref={containerRef}
            className="w-full h-full relative overflow-hidden bg-black rounded-2xl shadow-2xl"
        >
            {/* Custom Dotted Border Perimeter */}
            <div className="absolute inset-0 z-50 pointer-events-none rounded-2xl border-[3px] border-transparent"
                 style={{
                     borderImageSource: `radial-gradient(circle, rgba(255,255,255,0.3) 1px, transparent 1.5px)`,
                     borderImageSlice: 1,
                     borderImageRepeat: 'round',
                     borderImageWidth: '4px'
                 }} 
            />

            <div className="w-full h-full bg-black relative overflow-hidden">
            {/* Round History Badges */}
            <div className="absolute top-4 left-4 right-4 z-40 flex gap-2 overflow-x-auto no-scrollbar">
                {roundHistory.map((m, i) => (
                    <div 
                        key={i} 
                        className={`px-3 py-1 rounded-full text-xs font-bold border ${
                            m < 2 ? 'bg-red-500/20 text-red-500 border-red-500/30' :
                            m < 10 ? 'bg-blue-500/20 text-blue-400 border-blue-500/30' :
                            'bg-green-500/20 text-green-400 border-green-500/30'
                        }`}
                    >
                        {m.toFixed(2)}x
                    </div>
                ))}
            </div>

                {/* Main Canvas Engine */}
                <canvas 
                    ref={canvasRef} 
                    className="w-full h-full block"
                />

                {/* Overlays: Multiplier & Plane */}
                <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <AnimatePresence mode="wait">
                        {gameState === 'CRASHED' ? (
                            <motion.div 
                                initial={{ scale: 0.8, opacity: 0 }}
                                animate={{ scale: 1, opacity: 1 }}
                                className="flex flex-col items-center"
                            >
                                <span className="text-[#ff1744] text-5xl md:text-8xl font-black uppercase tracking-tighter italic drop-shadow-[0_0_20px_rgba(255,23,68,0.5)]">
                                    Flew Away!
                                </span>
                                <span className="text-white text-2xl font-bold opacity-60">
                                    at {multiplier.toFixed(2)}x
                                </span>
                            </motion.div>
                        ) : (
                            <motion.div 
                                key="multiplier"
                                initial={{ opacity: 0 }}
                                animate={{ 
                                    opacity: 1,
                                    scale: gameState === 'WAITING' ? 0.8 : [1, 1.02, 1] 
                                }}
                                transition={{ duration: 0.1 }}
                                className={`text-8xl md:text-[10rem] font-black tracking-tighter drop-shadow-2xl transition-colors duration-500 ${
                                    gameState === 'WAITING' ? 'text-white/20' : 'text-white'
                                }`}
                            >
                                {multiplier.toFixed(2)}x
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>

            {/* Plane Silhouette */}
            <motion.div 
                className="absolute z-30 flex items-center justify-center"
                animate={gameState === 'CRASHED' ? {
                    x: dimensions.width + 100,
                    y: -100,
                    rotate: 720,
                    opacity: 0
                } : {
                    left: planeTransform.x,
                    top: planeTransform.y,
                    rotate: planeTransform.angle
                }}
                transition={gameState === 'CRASHED' ? { duration: 1.5, ease: "easeIn" } : { type: "tween", ease: "linear", duration: 0.1 }}
                style={{ 
                    transformOrigin: 'center center',
                    width: 40,
                    height: 20
                }}
            >
                {/* Spotlight Beam */}
                {gameState === 'FLYING' && (
                    <div 
                        className="absolute left-full top-1/2 -translate-y-1/2 w-48 h-32 bg-gradient-to-r from-white/15 to-transparent pointer-events-none"
                        style={{ clipPath: 'polygon(0 40%, 100% 0, 100% 100%, 0 60%)' }}
                    />
                )}

                {/* Classic Propeller Plane - Small & Iconic */}
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ 
                        opacity: gameState === 'WAITING' ? 0 : 1,
                        scale: gameState === 'WAITING' ? 0.5 : 1 
                    }}
                >
                    <svg width="40" height="20" viewBox="0 0 40 20" fill="none" xmlns="http://www.w3.org/2000/svg">
                        {/* Fuselage */}
                        <path d="M38 10C38 12 30 14 20 14C10 14 2 12 2 10C2 8 10 6 20 6C30 6 38 8 38 10Z" fill="#ef4444"/>
                        {/* Main Wing */}
                        <path d="M18 10L8 2L12 10L8 18L18 10Z" fill="#cc1033"/>
                        {/* Tail Section */}
                        <path d="M5 10L0 7V13L5 10Z" fill="#991b1b"/>
                        <rect x="2" y="5" width="1" height="10" fill="#991b1b"/>
                        {/* Cockpit */}
                        <rect x="25" y="8" width="4" height="3" rx="1" fill="#1e293b" opacity="0.8"/>
                        {/* Propeller Spinner (Animating) */}
                        <circle cx="38" cy="10" r="4" stroke="#ffffff" strokeWidth="0.5" strokeDasharray="2 2" opacity="0.3" className="animate-spin duration-100" />
                    </svg>
                </motion.div>
            </motion.div>
        </div>
    )
}
