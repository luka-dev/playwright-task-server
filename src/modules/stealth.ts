// @ts-ignore
import * as config from "./../../config.json";
import {BrowserContext} from "playwright-core";
import * as fs from "fs";
import {strict} from "assert";

/**
 * Enable the stealth add-on
 * @param context
 */
export default async function (context: BrowserContext) {

    // Init evasions script on every page load
    let evasionsScript = fs.readFileSync(__dirname + "/" + 'evasions.js').toString();
    await context.addInitScript(evasionsScript);

    // Properly set UA info (vanilla Playwright only sets the UA)

    let userAgent = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/86.0.4240.111 Safari/537.36';

    config.RUN_OPTIONS.INLINE.args.forEach( arg => {
        let argDetails = arg.split('=', 2);
        if (argDetails[0] === '--user-agent' && typeof argDetails[1] === 'string') {
            userAgent = JSON.parse(argDetails[1]).trim();
        }
    });

    // @ts-ignore
    const acceptLanguage = context._options.locale;
    const platform = userAgent.indexOf('Macintosh') !== -1 ? 'MacIntel' : (userAgent.indexOf('Windows') !== -1 ? 'Win32' : '');
    // @ts-ignore
    const oscpu = userAgent.match('(Intel.*?|Windows.*?)[;)]') ? userAgent.match('(Intel.*?|Windows.*?)[;)]')[1] : '';
    const userAgentMetadata = undefined; // TODO, see https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#type-UserAgentMetadata


    context.on('page', async page => {
        // Chromium - use CDP to override
        try {
            // @ts-ignore
            (await page.context().newCDPSession(page))
                .send('Emulation.setUserAgentOverride', {
                    userAgent,
                    acceptLanguage,
                    platform,
                    userAgentMetadata
                });
        } catch (e) {
            console.log('Warning: could not set UA override:', e);
        }

        try {
            await page.setExtraHTTPHeaders({
                'Accept-Language': 'en-GB,en-US;q=0.9,en;q=0.8'
            });
        }
        catch (e) {

        }


    });
}
