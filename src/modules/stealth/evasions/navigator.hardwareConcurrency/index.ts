// @ts-nocheck

import {BrowserContext} from "playwright-chromium";
import EvasionMonitor from "../EvasionMonitor";

export default function (context: BrowserContext, monitor: EvasionMonitor) {
    context.on('page', (page) => {

        monitor.declareEvasionExecuted();

        page.on('domcontentloaded', () => {
            page.evaluate(() => {
                Object.defineProperty(
                    Object.getPrototypeOf(navigator),
                    'hardwareConcurrency',
                    {
                        value: opts.hardwareConcurrency || 4,
                        writable: false
                    }
                )
        })
                .catch( err => monitor.declareEvasionCrash(err) );
        })

    })
}