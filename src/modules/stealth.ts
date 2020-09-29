/**
 * @module playwright-addons/stealth
 */
import {fileURLToPath} from 'url';
import {dirname} from 'path';
import {appendFileSync} from 'fs';
import {BrowserContext} from "playwright";
import * as fs from "fs";

/**
 * Enable the stealth add-on
 * @param context
 * @param browserName
 */
export default async function (context: BrowserContext, browserName: string) {

    // Init evasions script on every page load
    // @ts-ignore

    let evasionsScript = fs.readFileSync(__dirname + "/" + 'evasions.js').toString();
    await context.addInitScript(evasionsScript);

    // Properly set UA info (vanilla Playwright only sets the UA)
    // @ts-ignore
    const userAgent = context._options.userAgent || '';
    // @ts-ignore
    const acceptLanguage = context._options.locale;
    const platform = userAgent.indexOf('Macintosh') !== -1 ? 'MacIntel' : (userAgent.indexOf('Windows') !== -1 ? 'Win32' : '');
    const oscpu = userAgent.match('(Intel.*?|Windows.*?)[;)]') ? userAgent.match('(Intel.*?|Windows.*?)[;)]')[1] : '';
    const userAgentMetadata = undefined; // TODO, see https://chromedevtools.github.io/devtools-protocol/tot/Emulation/#type-UserAgentMetadata

    // Firefox - write to prefs
    if (browserName.indexOf('FFBrowser') === 0) {
        let prefs = `
                user_pref("general.appversion.override", "` + userAgent.replace('Mozilla/', '') + `");
                user_pref("general.oscpu.override", "` + oscpu + `");
                user_pref("general.platform.override", "` + platform + `");
                user_pref("general.useragent.override", "` + userAgent + `");
                `;
        if (acceptLanguage) {
            prefs += `
                    user_pref("general.useragent.locale", "` + acceptLanguage + `");
                    user_pref("intl.accept_languages", "` + acceptLanguage + `");
                    `;
        }
    } else { // Chromium - use CDP to override
        for (const page of context.pages()) {
            try {
                console.log(page);

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
        }

        context.on('page', async page => {
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
        });

    }
}
