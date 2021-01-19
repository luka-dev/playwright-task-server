// @ts-nocheck

import {BrowserContext} from "playwright-chromium";
import EvasionMonitor from "../EvasionMonitor";

export default function (context: BrowserContext, monitor: EvasionMonitor) {
    context.on('page', (page) => {

        monitor.declareEvasionExecuted();

        page.on('domcontentloaded', () => {

            page.evaluate(() => {
                Object.defineProperty(Object.getPrototypeOf(navigator), 'languages',
                    {
                        // Copy over the existing descriptors (writable, enumerable, configurable, etc)
                        ...(Object.getOwnPropertyDescriptor(Object.getPrototypeOf(navigator), 'languages') || {}),
                        // Add our overrides (e.g. value, get())
                        ...{
                            get: () => ['en-US', 'en']
                        }
                    })
            })
                .catch(err => monitor.declareEvasionCrash(err));
        })

    })
}