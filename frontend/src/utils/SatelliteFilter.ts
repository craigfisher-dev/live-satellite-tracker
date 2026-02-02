import * as Cesium from 'cesium'

export function SatelliteFilterByName(omm : any) : Cesium.Color {

    let SatelliteName = omm["OBJECT_NAME"].toUpperCase()

    if (SatelliteName.includes("STARLINK")) {
    return Cesium.Color.DODGERBLUE;
    } 
    else if (SatelliteName.includes("ONEWEB")) {
        return Cesium.Color.LIMEGREEN;
    }
    else if (SatelliteName.includes("KUIPER")) {
        return Cesium.Color.ORANGE;
    }
    else if (SatelliteName.includes("IRIDIUM")) {
        return Cesium.Color.YELLOW;
    }
    else if (SatelliteName.includes("GPS") || SatelliteName.includes("NAVSTAR")) {
        return Cesium.Color.RED;
    }
    else if (SatelliteName.includes("GLOBALSTAR")) {
        return Cesium.Color.MAGENTA;
    }
    else if (SatelliteName.includes("GALILEO")) {
        return Cesium.Color.CYAN;
    }
    else if (SatelliteName.includes("GLONASS")) {
        return Cesium.Color.ORANGERED;
    }
    else if (SatelliteName.includes("BEIDOU")) {
        return Cesium.Color.GOLD;
    }
    else if (SatelliteName.includes("QIANFAN")) {
        return Cesium.Color.PURPLE;
    }
    // PLANET
    else if (SatelliteName.includes("SKYSAT") || SatelliteName.includes("FLOCK") || SatelliteName.includes("PELICAN") || SatelliteName.includes("TANAGER")) {
        return Cesium.Color.TOMATO;
    }
    else {
        return Cesium.Color.GRAY;  // "Other"
    }
}