
import {BrowserContext} from "playwright-chromium";
import EvasionMonitor from "../EvasionMonitor";
import * as Util from "util";
import * as fs from "fs";

export default function (context: BrowserContext, monitor: EvasionMonitor) {
    context.on('page', async (page) => {

        monitor.declareEvasionExecuted();

        const Utils = require('../Utils');

        await page.exposeFunction('Utils', Utils);

        page.on('console', msg => console.log('PAGE LOG:', msg.text()));

        page.on('domcontentloaded', async () => {

            page.evaluate(() => {

            })
                .catch( err => monitor.declareEvasionCrash(err) );
        })

    })
}