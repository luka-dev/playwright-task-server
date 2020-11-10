import {BrowserContext} from "playwright-core";

export default class Context {

    public readonly initTime: number;
    private browserContext: BrowserContext | null = null;

    public constructor(initTime: number | null = null, browserContext: BrowserContext | null = null) {
        if (initTime === null) {
            initTime = (new Date()).getTime();
        }

        this.initTime = initTime;
        this.browserContext = browserContext;
    }

    public setBrowserContext(browserContext: BrowserContext): void {
        this.browserContext = browserContext;
    }

    public async closeContext() {
        if (this.browserContext !== null) {
            await this.browserContext.close()
            return true;
        }
        return false;
    }

    public lifetime(): number {
        return (new Date()).getTime() - this.initTime;
    }
}
