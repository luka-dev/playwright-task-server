import {BrowserContextOptions} from "playwright-chromium/types/types";

export default function (contextOptions: BrowserContextOptions, timezone?: string): void {
    contextOptions.timezoneId = timezone ?? 'Europe/London';
}