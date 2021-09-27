import {ChromiumBrowserContext} from "playwright-chromium";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.addInitScript(function () {
        // @ts-ignore
        if (!window.chrome) {
            // Use the exact property descriptor found in headful Chrome
            // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
            Object.defineProperty(window, 'chrome', {
                writable: true,
                enumerable: true,
                configurable: false, // note!
                value: {} // We'll extend that later
            })
        }

        // That means we're running headful and don't need to mock anything
        // @ts-ignore
        if ('csi' in window.chrome) {
            return // Nothing to do here
        }

        // Check that the Navigation Timing API v1 is available, we need that
        if (!window.performance || !window.performance.timing) {
            return
        }

        const {timing} = window.performance

        // @ts-ignore

        Object.defineProperty(window.chrome, 'csi', {
            get:
                function () {
                    return {
                        onloadT: timing.domContentLoadedEventEnd,
                        startE: timing.navigationStart,
                        pageT: Date.now() - timing.navigationStart,
                        tran: 15 // Transition type or something
                    }
                },
            set:
                function (a) {}
        })
    });
}