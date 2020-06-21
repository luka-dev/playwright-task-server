import {ChromiumBrowser, FirefoxBrowser, WebKitBrowser} from "playwright";
import {chromium, firefox, webkit} from "playwright";
import {Task} from "./Task";


export default class BrowsersPool {

    private browsersList: any = {};
    private browser: ChromiumBrowser|FirefoxBrowser|WebKitBrowser|null = null;

    private defaultBrowserOptions: object = {};

    private tasksPool: Task[] = [];

    private maxWorkers: number|null;

    private tasker: NodeJS.Timeout|null = null;

    public constructor(args: string[], maxWorkers: number|null, headless: boolean = true, slowMo: number = 0, browser: string = 'chromium') {

        // @ts-ignore
        this.browsersList['chromium'] = chromium;
        // @ts-ignore
        this.browsersList['firefox'] = firefox;
        // @ts-ignore
        this.browsersList['webkit'] = webkit;

        this.browser = null;
        this.tasksPool = [];
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

    public runTasker(): void {
        this.tasker = setInterval(() => {
            console.log('tasker');
        }, 10);
    }

    public stopTasker(): void {
        if (this.tasker) {
            clearInterval(this.tasker);
        }
    }

    public setDefaultBrowserOptions(options: object) {
        this.defaultBrowserOptions = options;
    }

    public getDefaultBrowserOptions() {
        return this.defaultBrowserOptions;
    }

    public addTask(script: string, options: object|null) {
        if (options === null) {
            options = this.getDefaultBrowserOptions();
        }

        this.tasksPool.push(new Task(script, options));
    }




}