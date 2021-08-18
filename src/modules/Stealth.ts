import {ChromiumBrowserContext, Page} from "playwright-chromium";
import ChromeApp from "./evasions/ChromeApp";
import ChromeCsi from "./evasions/ChromeCsi";
import ChromeLoadTimes from "./evasions/ChromeLoadTimes";
import NavigatorWebdriver from "./evasions/NavigatorWebdriver";
import NavigatorUserAgentData from "./evasions/NavigatorUserAgentData";
import NavigatorVendor from "./evasions/NavigatorVendor";
import ConnectionRtt from "./evasions/ConnectionRtt";
import NavigatorPluginsAndMimeTypes from "./evasions/NavigatorPluginsAndMimeTypes";
import NavigatorPermissions from "./evasions/NavigatorPermissions";

/**
 * Enable the stealth add-on
 * @param context
 */
export default async function (context: ChromiumBrowserContext) {
    // Init evasions script on every page load
    await ChromeApp(context);
    await ChromeCsi(context);
    await ChromeLoadTimes(context);
    await ConnectionRtt(context);
    await NavigatorPluginsAndMimeTypes(context);
    await NavigatorPermissions(context);
    await NavigatorUserAgentData(context);
    await NavigatorVendor(context);
    await NavigatorWebdriver(context);
}