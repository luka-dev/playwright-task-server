import {ChromiumBrowserContext} from "playwright-chromium";

export default async function (context: ChromiumBrowserContext, userAgent?: string): Promise<void> {

    if (userAgent === undefined) {
        userAgent = "";
    }

    const regexpDigits = /Chrome\/(\d+)\./.exec(userAgent) ?? [];
    const version = regexpDigits.length > 1 ? regexpDigits[1] : "99";
    const isMobile = /.*(Android|iOS|Mobile).*/.exec(userAgent) === null;

    await context.addInitScript(function (arg: {version: string, isMobile: boolean}) {

        Object.defineProperty(navigator,
            'userAgentData',
            {
                get: function () {
                    return {
                        brands: [
                            {brand: "Google Chrome", version: arg.version},
                            {brand: " Not;A Brand", version: "99"},
                            {brand: "Chromium", version: arg.version},
                        ],
                        isMobile: arg.isMobile
                    }
                },
                set: function () {
                }
            });
    }, {version, isMobile});
}