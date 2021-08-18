import {CDPSession, ChromiumBrowserContext, Page} from "playwright-core";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.addInitScript(function () {
        // @ts-ignore
        const version = /Chrome\/(\d+)\./.exec(navigator.userAgent)[1] ?? "99";
        const isMobile = /.*(Android|iOS|Mobile).*/.exec(navigator.userAgent) === null;

        Object.defineProperty(navigator,
            'userAgentData',
            {
                get: function () {
                    return {
                        brands: [
                            {brand: " Not;A Brand", version: "99"},
                            {brand: "Google Chrome", version: version},
                            {brand: "Chromium", version: version},
                        ],
                        isMobile: isMobile
                    }
                },
                set: function () {
                }
            });
    });
}