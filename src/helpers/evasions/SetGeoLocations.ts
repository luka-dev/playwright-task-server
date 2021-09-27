import {BrowserContextOptions, Geolocation} from "playwright-chromium/types/types";

export default function (contextOptions: BrowserContextOptions, ip?: Geolocation): void {
    contextOptions.geolocation = ip ?? {latitude: 51.528308, longitude: -0.3817765};

    if (contextOptions.permissions === undefined) {
        contextOptions.permissions = [];
    }
    contextOptions.permissions.push('geolocation');
}