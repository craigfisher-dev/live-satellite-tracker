import { describe, it, expect } from "vitest"
import * as Cesium from 'cesium'
import { filterByNetwork } from "../utils/SatelliteFilter"

describe('filterByNetwork', () => {
    it('should return DODGERBLUE for Starlink satellite', () => {
        const omm : any = {"OBJECT_NAME":"STARLINK-32134","OBJECT_ID":"2024-132Y","EPOCH":"2026-03-21T01:46:20.919072","MEAN_MOTION":"15.30243035","ECCENTRICITY":"9.4560000000000003E-5","INCLINATION":"53.161000000000001","RA_OF_ASC_NODE":"359.53160000000003","ARG_OF_PERICENTER":"84.5017","MEAN_ANOMALY":"275.60919999999999","EPHEMERIS_TYPE":"0","CLASSIFICATION_TYPE":"U","NORAD_CAT_ID":"60300","ELEMENT_SET_NO":"999","REV_AT_EPOCH":"9330","BSTAR":"0.00022657891999999999","MEAN_MOTION_DOT":"6.3659999999999997E-5","MEAN_MOTION_DDOT":"0"}
        const ColorFilter : Cesium.Color = filterByNetwork(omm)

        expect(ColorFilter).toEqual(Cesium.Color.DODGERBLUE)
    })
})