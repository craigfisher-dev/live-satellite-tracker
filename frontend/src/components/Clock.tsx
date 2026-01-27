import { Play, Pause, FastForward, RotateCcw } from 'lucide-react'

interface ClockProps {
    simTime: Date
    isPaused: boolean
    simSpeed: number
    setSimTime: (simTime: Date) => void
    setIsPaused: (isPaused: boolean) => void
    setSimSpeed: (simSpeed: number) => void
}

const speeds = [-100, -10, -1, 1, 10, 100]

function Clock({simTime, isPaused, simSpeed, setSimTime, setIsPaused, setSimSpeed}: ClockProps) {
    const utcString = simTime.toUTCString()

    const status = getSimTimeStatus(simTime)
    const color = status === 'ahead' ? 'blue' : status === 'behind' ? 'red' : 'green'

    function getSimTimeStatus(simTime : Date)
    {
        const realTime = new Date()
        const diff = simTime.getTime() - realTime.getTime()  // difference in milliseconds
        const tolerance = 1000  // 1 seconds
        
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
        currentIndex === 5 ? currentIndex = 5 : currentIndex = currentIndex + 1
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
        setSimSpeed(speeds[3])
        // Starts up again
        setIsPaused(false)
    }


    return (
        <div>
            <span style={{ color: color }}>
                {utcString}
            </span>
            {/* Reverse */}
            <button onClick={handleSpeedDecrease}>
                {<FastForward style={{ transform: 'scaleX(-1)' }}/>}
            </button>
            {/* Play/Pause */}
            <button onClick={handleClick}>
                {isPaused ? <Play /> : <Pause />}
            </button>
            {/* Forward */}
            <button onClick={handleSpeedIncrease}>
                {<FastForward/>}
            </button>
            {/* Reset Time */}
            <button onClick={handleResetTime}>
                {<RotateCcw/>}
            </button>
        </div>
    )
}

export default Clock