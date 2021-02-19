import {ChromiumBrowserContext, Page} from "playwright-chromium";
import * as fs from "fs";
import UserAgent from "./evasions/UserAgent";

/**
 * Enable the stealth add-on
 * @param context
 */
export default async function (context: ChromiumBrowserContext) {
    // Init evasions script on every page load
    let evasionsScript = fs.readFileSync(__dirname + "/evasions/" + 'onPage.js').toString();
    await context.addInitScript(evasionsScript);

    context.on('page', async (page: Page) => {
        try {
            const cdpSession = await context.newCDPSession(page);

            new UserAgent(page, context, cdpSession);

            page.on('console', msg => console.log('PageLog:', msg.text()));
        } catch (e) {
            console.log(e.toString());
        }
    });
}
