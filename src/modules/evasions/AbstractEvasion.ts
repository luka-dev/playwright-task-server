import {ChromiumBrowserContext, Page} from "playwright-chromium";
import {CDPSession} from "playwright-chromium/types/types";

export default abstract class AbstractEvasion {
    protected declare page: Page;
    protected declare context: ChromiumBrowserContext;
    protected declare cdpSession: CDPSession;

    public constructor(page: Page, context: ChromiumBrowserContext, cdpSession: CDPSession) {
        this.page = page;
        this.context = context;
        this.cdpSession = cdpSession;
    }

    public abstract async use(): Promise<void>;
}