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


    //sec-ch-ua
    context.setExtraHTTPHeaders({
        'Accept-Language': 'en-US',
        'Cache-Control': 'max-age=0',
        'sec-ch-ua': '"Google Chrome"; v="87"',
        'sec-ch-ua-mobile': '?0',
    })


    // Init evasions script on every page load
    let evasionsScript = fs.readFileSync(__dirname + "/" + 'evasions.js').toString();
    await context.addInitScript(evasionsScript);

    context.on('page', page => {
        try {
            page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        } catch (e) {
            console.log(e.toString());
        }
    });
}
