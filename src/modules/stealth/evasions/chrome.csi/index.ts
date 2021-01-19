// @ts-nocheck

import {BrowserContext} from "playwright-chromium";
import EvasionMonitor from "../EvasionMonitor";

export default function (context: BrowserContext, monitor: EvasionMonitor) {
    context.on('page', (page) => {

        monitor.declareEvasionExecuted();

        page.on('domcontentloaded', () => {
            page.evaluate(() => {
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
                if ('csi' in window.chrome) {
                    return; // Nothing to do here
                }

                // Check that the Navigation Timing API v1 is available, we need that
                if (!window.performance || !window.performance.timing) {
                    return;
                }

                const {timing} = window.performance

                window.chrome.csi = function () {
                    return {
                        onloadT: timing.domContentLoadedEventEnd,
                        startE: timing.navigationStart,
                        pageT: Date.now() - timing.navigationStart,
                        tran: 15 // Transition type or something
                    }
                }

            })
                .catch( err => monitor.declareEvasionCrash(err))
        });
    })
}