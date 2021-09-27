import {ChromiumBrowserContext} from "playwright-chromium";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.setExtraHTTPHeaders({
        'Cache-Control': 'max-age=0',
    });
}