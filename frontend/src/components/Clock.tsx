import { Play, Pause, FastForward, RotateCcw } from 'lucide-react'

// A Clock is a React component that has 6 props:
interface ClockProps {
    simTime: Date                               // Current time of the simulation (Speed it increases and decreases is based on the (SimSpeed))
    isPaused: boolean                           // True (sim is paused), (sim is running) False 
    simSpeed: number                            // Current speed of the simulation Example: 1x, 10x, -1x (backwards in time)
    setSimTime: (simTime: Date) => void         // Handles the setting of sim time (Normally used to reset the sim time back to current time)
    setIsPaused: (isPaused: boolean) => void    // Handles the changing of simulation state (paused or running)
    setSimSpeed: (simSpeed: number) => void     // Handles the changing of speed 
}

// Array of SimSpeed options
const speeds = [-1000, -500, -100, -10, -1, 1, 10, 100, 500, 1000]

const speedLength : number = speeds.length

// Shows the simulation time in (UTC) with different controls:
// pause: (Start and Stop)
// speed: (Speed up/Slow down), (Moves up and down in the speeds array)  Example: (Speed increase) [-100 to -10] (Speed Decrease) [500 to 100]
// reset-to-real-time: (Sets simulation time back to current real time in UTC, speed back to 1x, and unpauses)
function Clock({simTime, isPaused, simSpeed, setSimTime, setIsPaused, setSimSpeed}: ClockProps) {
    
    // Formats simTime as UTC text, e.g. "Thu, 12 Nov 2026 14:30:05 UTC" (JS labels it GMT, so we relabel it)
    const utcString = simTime.toUTCString().replace('GMT', 'UTC')

    const color = '#60a5fa' // soft blue

    // Pause / resume (play/pause button)
    function handleClick() {
        isPaused ? setIsPaused(false) : setIsPaused(true)
    }

    function handleSpeedIncrease() {
        let currentIndex = speeds.indexOf(simSpeed)
        // If already at the max speed (1000x) do not increase, else move up one step in speeds
        currentIndex === speedLength - 1 ? currentIndex = speedLength - 1 : currentIndex = currentIndex + 1
        setSimSpeed(speeds[currentIndex])
    }


    function handleSpeedDecrease() {
        let currentIndex = speeds.indexOf(simSpeed)
        // If already at the min speed (-1000x) do not decrease, else move down one step in speeds
        currentIndex === 0 ? currentIndex = 0 : currentIndex = currentIndex - 1
        setSimSpeed(speeds[currentIndex])
    }

    function handleResetTime() {
        const realTime = new Date()
        setSimTime(realTime)
        // Resets SimSpeed back to 1x 
        // (1x sits at the midpoint of the speeds array: speedLength/2)
        setSimSpeed(speeds[speedLength/2])
        // Starts up again (Unpauses the sim)
        setIsPaused(false)
    }


    return (
        <div className="bg-black/80 border border-white/10 rounded-xl px-3 py-0.5 inline-flex items-center gap-2">
            {/* Time display: current simulation time in UTC (utcString) */}
            <span style={{ color: color }} className="font-mono text-sm">
                {utcString}
            </span>
            
            {/* Controls row: speed down, pause/resume, speed up, reset to real time */}
            <div className="flex items-center gap-1">
                {/* Speed down: FastForward flipped to point left, steps down the speeds array (past 1x it rewinds time) */}
                <button onClick={handleSpeedDecrease} className="p-1.5 hover:bg-white/10 rounded">
                    <FastForward className="w-4 h-4 text-white/70 rotate-180" />
                </button>
                {/* Pause/resume: icon shows the action (Play while paused, Pause while running) */}
                <button onClick={handleClick} className="p-1.5 hover:bg-white/10 rounded">
                    {isPaused ? <Play className="w-4 h-4 text-white/70" /> : <Pause className="w-4 h-4 text-white/70" />}
                </button>
                {/* Speed up: steps up the speeds array */}
                <button onClick={handleSpeedIncrease} className="p-1.5 hover:bg-white/10 rounded">
                    <FastForward className="w-4 h-4 text-white/70" />
                </button>
                {/* Reset to real time (also sets 1x and unpauses) */}
                <button onClick={handleResetTime} className="p-1.5 hover:bg-white/10 rounded">
                    <RotateCcw className="w-4 h-4 text-white/70" />
                </button>
            </div>

            {/* Speed display: current multiplier, e.g. 10x (negative = rewinding) */}
            <span className="text-white/70 text-xs font-mono w-8 text-center">
                {simSpeed}x
            </span>
        </div>
    )
}

export default Clock