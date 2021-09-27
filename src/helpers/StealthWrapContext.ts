import {ChromiumBrowserContext} from "playwright-chromium";
import {BrowserContextOptions} from "playwright-chromium/types/types";
import ConsoleLog from "./evasions/ConsoleLog";
import ChromeApp from "./evasions/ChromeApp";
import ChromeCsi from "./evasions/ChromeCsi";
import ChromeLoadTimes from "./evasions/ChromeLoadTimes";
import NavigatorWebdriver from "./evasions/NavigatorWebdriver";
import NavigatorUserAgentData from "./evasions/NavigatorUserAgentData";
import NavigatorVendor from "./evasions/NavigatorVendor";
import ConnectionRtt from "./evasions/ConnectionRtt";
import NavigatorPluginsAndMimeTypes from "./evasions/NavigatorPluginsAndMimeTypes";
import NavigatorPermissions from "./evasions/NavigatorPermissions";
import ExtraHeaders from "./evasions/ExtraHeaders";

/**
 * Enable the stealth add-on
 * @param context
 * @param contextOptions
 */
export default async function (context: ChromiumBrowserContext, contextOptions: BrowserContextOptions) {
    // Init evasions script on every page load
    await ConsoleLog(context);
    await ExtraHeaders(context);
    await ChromeApp(context);
    await ChromeCsi(context);
    await ChromeLoadTimes(context);
    await ConnectionRtt(context);
    await NavigatorPluginsAndMimeTypes(context);
    await NavigatorPermissions(context);
    await NavigatorUserAgentData(context, contextOptions.userAgent);
    await NavigatorVendor(context);
    await NavigatorWebdriver(context);
}