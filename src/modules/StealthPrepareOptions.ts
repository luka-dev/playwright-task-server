import {BrowserContextOptions} from "playwright-chromium/types/types";
import SetTimeZone from "./evasions/SetTimeZone";
import SetGeoLocations from "./evasions/SetGeoLocations";
import {ProxyLookUp} from "../helpers/ProxyLookUp";


/**
 * Enable the stealth add-on
 * @param contextOptions
 */
export default function (contextOptions: BrowserContextOptions) {
    const ip = ProxyLookUp(contextOptions.proxy?.server);

    // Init context options tweaks
    SetTimeZone(contextOptions, ip?.timezone);
    SetGeoLocations(contextOptions, ip?.ll ? {latitude: ip?.ll[0], longitude: ip?.ll[1]} : undefined);
}