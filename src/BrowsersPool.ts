import {ChromiumBrowser, FirefoxBrowser, WebKitBrowser} from "playwright";
import {chromium, firefox, webkit} from "playwright";
import {Task} from "./Task";


export default class BrowsersPool {

    private browsersList: any = {};
    private browser: ChromiumBrowser|FirefoxBrowser|WebKitBrowser|null = null;
    private defaultBrowserOptions: object = {};

    private readonly maxWorkers: number|null;

    private tasksQueue: Task[] = [];
    private taskManager: NodeJS.Timeout|null = null;

    public constructor(args: string[], maxWorkers: number|null, browser: string = 'chromium', headless: boolean = true, slowMo: number = 0,) {

        // @ts-ignore
        this.browsersList['chromium'] = chromium;
        // @ts-ignore
        this.browsersList['firefox'] = firefox;
        // @ts-ignore
        this.browsersList['webkit'] = webkit;

        this.browser = null;
        this.tasksQueue = [];
        this.maxWorkers = maxWorkers;

        if (typeof this.maxWorkers === "number" && this.maxWorkers < 1) {
            console.log(`Wrong maxWorkers: ${this.maxWorkers}`);
            console.log(`Dying`);
            process.exit(1);
        }

        if (browser === 'chromium' || browser === 'firefox' || browser === 'webkit') {
            (async () => {
                this.browser = await this.browsersList[browser].launch();
            })();
        }
        else {
            console.log(`Wrong browser type: ${browser}`);
            console.log(`Dying`);
            process.exit(1);
        }
    }

    public runTaskManager(): void {
        this.taskManager = setInterval(() => {

        }, 10);
    }

    public stopTaskManager(): void {
        if (this.taskManager !== null) {
            clearInterval(this.taskManager);
            this.taskManager = null;
        }
    }

    public setDefaultBrowserOptions(options: object) {
        this.defaultBrowserOptions = options;
    }

    public getDefaultBrowserOptions() {
        return this.defaultBrowserOptions;
    }

    public addTask(script: string, callback: (responseArray: object) => void,  options: object|null = null) {
        if (options === null) {
            options = this.getDefaultBrowserOptions();
        }

        this.tasksQueue.push(new Task(script, options));
    }




}