/**
 * PlayWright module
 *
 * This file will setup hooks for chromium
 * to mask as simple, not headless chrome
 */

import {BrowserContext} from "playwright-chromium";
import EvasionMonitor from "./evasions/EvasionMonitor";

export default function (context: BrowserContext) {
    const listOfEvasions = [
        // 'chrome.app',
        // 'chrome.csi',
        // 'chrome.loadTimes',
        // 'chrome.runtime',
        '_template',

    ]

    let monitors: {[key: string]: EvasionMonitor } = {};

    listOfEvasions.forEach((evasionName) => {
        monitors[evasionName] = new EvasionMonitor(evasionName);
        require(`./evasions/${evasionName}/index`).default(context, monitors[evasionName]);
    });

    // for (let monitorsKey in monitors) {
    //     console.log(monitors[monitorsKey].getEvasionName() + '|' + monitors[monitorsKey].getCrashError() !== null);
    // }

    //todo collect EvasionsMonitor's
}