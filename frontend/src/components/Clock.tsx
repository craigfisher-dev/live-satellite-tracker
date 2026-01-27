import { Text, Hud, OrthographicCamera } from '@react-three/drei'

interface ClockProps {
    time: Date
}

function Clock({time} : ClockProps) {
    
    const utcString = time.toUTCString()

    return (
        <Hud>
            <OrthographicCamera  
                makeDefault
                position={[0, 0, 100]}
                left={-5}
                right={5}
                top={5}
                bottom={-5}
            />
            <ambientLight intensity={1} />
            <Text 
                color="green" 
                fontSize={0.2}
                position={[4.8, -4.8, 0]}
                anchorX="right" 
                anchorY="bottom"
            >
                {utcString}
            </Text>
        </Hud>
    )
}

export default Clock