import {extractFullDomain} from "@dashlane/simple-url-parser";
import {resolve as dnsResolve} from "dns";
import geoip, {Lookup} from "geoip-lite";

function LinkResolve(server?: string): string | undefined {
    if (server === undefined
        || server?.indexOf('127.0.0.1') > -1
        || server?.indexOf('localhost') > -1
    ) {
        return undefined;
    }

    const hostname: string | null = server ? extractFullDomain(server) : null;
    if (hostname !== null && hostname.indexOf('.') > 0 && /\w+/.test(hostname)) {
        dnsResolve(hostname, (err: NodeJS.ErrnoException | null, addresses: string[]) => {
            if (err === null && addresses.length) {
                return addresses[0] ?? undefined;
            }
        });
    }
    return hostname ?? undefined;
}

export function ProxyLookUp(server?: string): Lookup | null {
    const ip = LinkResolve(server);
    if (!ip) {
        return null;
    }
    return geoip.lookup(ip);
}