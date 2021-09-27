import {ChromiumBrowserContext} from "playwright-chromium";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.addInitScript(function () {
        // @ts-ignore
        // navigator.vendor = "Google Inc.";
        Object.defineProperty(
            navigator,
            "vendor",
            {
                get:
                    function () {
                        return "Google Inc.";
                    },
                set:
                    function (a) {
                    }
            });
    });
}