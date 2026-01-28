import { Play, Pause, FastForward, RotateCcw } from 'lucide-react'

interface ClockProps {
    simTime: Date
    isPaused: boolean
    simSpeed: number
    setSimTime: (simTime: Date) => void
    setIsPaused: (isPaused: boolean) => void
    setSimSpeed: (simSpeed: number) => void
}

const speeds = [-1000, -500, -100, -10, -1, 1, 10, 100, 500, 1000]

const speedLength : number = speeds.length

function Clock({simTime, isPaused, simSpeed, setSimTime, setIsPaused, setSimSpeed}: ClockProps) {
    const utcString = simTime.toUTCString()

    const status = getSimTimeStatus(simTime)
    const color = status === 'ahead' ? 'blue' : status === 'behind' ? 'red' : 'green'

    function getSimTimeStatus(simTime : Date)
    {
        const realTime = new Date()
        const diff = simTime.getTime() - realTime.getTime()  // difference in milliseconds
        const tolerance = 1500  // 1.5 seconds
        
        if (diff > tolerance) {
            return "ahead"
        } else if (diff < -tolerance) {
            return "behind"
        } else {
            return "current"
        }
    }

    function handleClick() {
        isPaused ? setIsPaused(false) : setIsPaused(true)
    }

    function handleSpeedIncrease() {
        let currentIndex = speeds.indexOf(simSpeed)
        // If 100 speed do not increase else increase speed
        currentIndex === speedLength - 1 ? currentIndex = speedLength - 1 : currentIndex = currentIndex + 1
        setSimSpeed(speeds[currentIndex])
    }


    function handleSpeedDecrease() {
        let currentIndex = speeds.indexOf(simSpeed)
        // If -100 speed do not increase else increase speed
        currentIndex === 0 ? currentIndex = 0 : currentIndex = currentIndex - 1
        setSimSpeed(speeds[currentIndex])
    }

    function handleResetTime() {
        const realTime = new Date()
        setSimTime(realTime)
        // Resets SimSpeed back to 1x
        setSimSpeed(speeds[speedLength/2])
        // Starts up again
        setIsPaused(false)
    }


    return (
        <div>
            <span style={{ color: color }}>
                {utcString}
            </span>
            <button onClick={handleSpeedDecrease} className="p-1 bg-black/70 rounded ml-2">
                <FastForward className="w-4 h-4 text-white rotate-180" />
            </button>
            <button onClick={handleClick} className="p-1 bg-black/70 rounded ml-1">
                {isPaused ? <Play className="w-4 h-4 text-white" /> : <Pause className="w-4 h-4 text-white" />}
            </button>
            <button onClick={handleSpeedIncrease} className="p-1 bg-black/70 rounded ml-1">
                <FastForward className="w-4 h-4 text-white" />
            </button>
            <button onClick={handleResetTime} className="p-1 bg-black/70 rounded ml-1">
                <RotateCcw className="w-4 h-4 text-white" />
            </button>
        </div>
    )
}

export default Clock