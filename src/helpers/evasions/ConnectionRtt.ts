import {ChromiumBrowserContext} from "playwright-chromium";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.addInitScript(function () {
        // @ts-ignore
        Object.defineProperty(navigator.connection, 'rtt', {
            get: () => 50,
        });
    });
}