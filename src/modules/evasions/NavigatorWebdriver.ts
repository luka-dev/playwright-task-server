import {CDPSession, ChromiumBrowserContext, Page} from "playwright-core";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.addInitScript(function () {
        if (navigator.webdriver === false) {
            // Post Chrome 89.0.4339.0 and already good
        } else if (navigator.webdriver === undefined) {
            // Pre Chrome 89.0.4339.0 and already good
        } else {
            // Pre Chrome 88.0.4291.0 and needs patching
            Object.defineProperty(
                navigator,
                "webdriver",
                {
                    get:
                        function () {
                            return false;
                        },
                    set: function (a) {}
                });
        }
    });
}