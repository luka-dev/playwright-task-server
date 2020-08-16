import {ChromiumBrowser, FirefoxBrowser, WebKitBrowser} from "playwright";
import {chromium, firefox, webkit} from "playwright";
import Task, {TaskTimes, DONE as TaskDONE, FAIL as TaskFAIL} from "./Task";
import URL from "url";

interface InlineOptions {
    args: string[],
    headless: boolean,
    slowMo: number
}

export default class BrowsersPool {

    private browsersList: any = {};
    private browser: ChromiumBrowser|FirefoxBrowser|WebKitBrowser|null = null;
    private defaultBrowserOptions: object = {};

    private readonly maxWorkers: number|null;

    private tasksQueue: Task[] = [];
    private taskManager: NodeJS.Timeout|null = null;

    public constructor(options: InlineOptions, maxWorkers: number|null, browser: string = 'chromium') {

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
        else if (this.maxWorkers === null) {
            //Get CPU's cores count
            this.maxWorkers = 12;
            //todo get cpu count dynamic
        }

        if (browser === 'chromium' || browser === 'firefox' || browser === 'webkit') {
            (async () => {
                this.browser = await this.browsersList[browser].launch(options);
            })();
        }
        else {
            console.log(`Wrong browser type: ${browser}`);
            console.log(`Dying`);
            process.exit(1);
        }
    }

    public runTaskManager(): void {
        this.taskManager = setInterval( () => {
            if (this.tasksQueue.length)
            {
                let task: Task = this.tasksQueue[0]; //take first task
                this.tasksQueue.shift();
                task.setRunTime((new Date()).getTime());

                try {
                    let modules = {
                        URL: URL
                    };

                    console.log(URL);

                    let script = new Function(`(async () => {
                            let context = await this.browser.newContext();
                            
                            (async function (task, context, TaskDONE, TaskFAIL, modules) {
                                try {
                                    let data = {};
                                    ${task.getScript()}
                                    if (context !== null && typeof context.close === 'function') {
                                        context.close();
                                    }
                                    task.getCallback()(TaskDONE, data, task.getTaskTime());
                                }
                                catch (e) {
                                    if (context !== null && typeof context.close === 'function') {
                                        context.close();
                                    }
                                    task.getCallback()(TaskFAIL, {'error': 'Fail in script running', 'log': e.toString()}, task.getTaskTime());
                                }
                            })(arguments[0], context, arguments[1], arguments[2], arguments[3]);
                    })()`);

                    // @ts-ignore
                    script.call(this, task, TaskDONE, TaskFAIL, modules);
                }
                catch (e) {
                    task.getCallback()(TaskFAIL, {'error': 'Fail in script calling', 'log': e.toString()}, task.getTaskTime());
                }

            }
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

    public addTask(script: string, callback: (scriptStatus: string, scriptReturn: object, times: TaskTimes) => void,  options: object|null = null) {
        if (options === null) {
            options = this.getDefaultBrowserOptions();
        }

        this.tasksQueue.push(new Task(script, callback, options));
    }

}
