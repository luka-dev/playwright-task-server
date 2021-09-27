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
        if ('app' in window.chrome) {
            return // Nothing to do here
        }

        const STATIC_DATA = JSON.parse(
            `{
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
}`.trim());

        // @ts-ignore
        Object.defineProperty(window.chrome, 'app', {
            ...STATIC_DATA,

            get isInstalled() {
                return false;
            },

            getDetails: function getDetails() {
                return null;
            },
            getIsInstalled: function getDetails() {
                return false;
            },
            runningState: function getDetails() {
                return 'cannot_run';
            }
        })
    });
}