// @ts-nocheck

import {BrowserContext} from "playwright-chromium";
import EvasionMonitor from "../EvasionMonitor";

export default function (context: BrowserContext, monitor: EvasionMonitor) {

    function evasion(page: Page) {
        page.evaluate(() => {
            if (!window.chrome) {
                // Use the exact property descriptor found in headful Chrome
                // fetch it via `Object.getOwnPropertyDescriptor(window, 'chrome')`
                Object.defineProperty(window, 'chrome', {
                    writable: true,
                    enumerable: true,
                    configurable: false, // note!
                    value: {} // We'll extend that later
                });
            }

            // That means we're running headful and don't need to mock anything
            if ('app' in window.chrome) {
                return; // Nothing to do here
            }

            const STATIC_DATA =
                {
                    "isInstalled": false,
                    "InstallState": {
                        "DISABLED": "disabled",
                        "INSTALLED": "installed",
                        "NOT_INSTALLED": "not_installed"
                    },
                    "RunningState": {
                        "CANNOT_RUN": "cannot_run",
                        "READY_TO_RUN": "ready_to_run",
                        "RUNNING": "running"
                    }
                };

            window.chrome.app = {
                ...STATIC_DATA,

                get isInstalled() {
                    return false;
                },

                getDetails: function getDetails() {
                    if (arguments.length) {
                        throw makeError.ErrorInInvocation(`getDetails`)
                    }
                    return null;
                },
                getIsInstalled: function getDetails() {
                    if (arguments.length) {
                        throw makeError.ErrorInInvocation(`getIsInstalled`)
                    }
                    return false;
                },
                runningState: function getDetails() {
                    if (arguments.length) {
                        throw makeError.ErrorInInvocation(`runningState`)
                    }
                    return 'cannot_run';
                }
            }

        })
            .catch( err => monitor.declareEvasionCrash(err));
    }

    context.on('page', (page) => {

        monitor.declareEvasionExecuted();

        const makeError = {
            ErrorInInvocation: (fn) => {
                const err = new TypeError(`Error in invocation of app.${fn}()`);
                return utils.stripErrorWithAnchor(err, `at ${fn} (eval at <anonymous>`);
            }
        }

        page.on('domcontentloaded', () => {
            evasion(page)
        });
    })
}