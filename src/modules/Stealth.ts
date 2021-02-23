import {ChromiumBrowserContext, Page} from "playwright-chromium";
import UserAgent from "./evasions/UserAgent";
import AcceptLanguage from "./evasions/AcceptLanguage";
import {PageStealth} from "./evasions/PageStealth";

/**
 * Enable the stealth add-on
 * @param context
 */
export default async function (context: ChromiumBrowserContext) {
    // Init evasions script on every page load

    context.on('page', async (page: Page) => {
        try {
            const cdpSession = await context.newCDPSession(page);

            await (new UserAgent(page, context, cdpSession)).use();
            await (new AcceptLanguage(page, context, cdpSession)).use();
            await PageStealth(page);

            page.on('console', msg => console.log('PageLog:', msg.text()));
        } catch (e) {
            console.log(e.toString());
        }
    });
}
