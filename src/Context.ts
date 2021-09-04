import {Dialog, BrowserContext} from "playwright-chromium";

export default class Context {

    public readonly initTime: number;
    private browserContext: BrowserContext | null = null;
    private dialogs: Dialog[] = [];

    public constructor(initTime: number | null = null, browserContext: BrowserContext | null = null) {
        if (initTime === null) {
            initTime = (new Date()).getTime();
        }

        this.initTime = initTime;
        this.browserContext = browserContext;
    }

    public setBrowserContext(browserContext: BrowserContext): void {
        this.browserContext = browserContext;

        //workaround for known bug https://github.com/microsoft/playwright/issues/4179
        this.browserContext.on('page', page => {
            page.on('dialog', dialog => {
                this.dialogs.push(dialog);
            });
        })
    }

    public async closeContext() {
        if (this.browserContext !== null) {

            for (const dialog of this.dialogs) {
                try {
                    await dialog.dismiss();
                }
                catch (e) {
                    //if dialog already doesnt exist
                }
            }

            await this.browserContext.close()
            return true;
        }
        return false;
    }

    public lifetime(): number {
        return (new Date()).getTime() - this.initTime;
    }
}
