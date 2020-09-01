import {
    ChromiumBrowser,
    FirefoxBrowser,
    WebKitBrowser,
    chromium,
    firefox,
    webkit,
    errors
} from "playwright";
import Task, {TaskTimes, DONE as TaskDONE, FAIL as TaskFAIL} from "./Task";
import URL from "url";
import {promiseSafeSync} from "./modules/pss";
import OS from "os";
import {Stats} from "./Stats";

interface InlineOptions {
    args: string[],
    headless: boolean,
    slowMo: number
}

export default class BrowsersPool {

    private browsersList: any = {};
    private browser: ChromiumBrowser | FirefoxBrowser | WebKitBrowser | null = null;
    private defaultBrowserOptions: object = {};

    private readonly maxWorkers: number;

    private tasksQueue: Task[] = [];
    private taskManager: NodeJS.Timeout | null = null;

    private contextsCounter: number = 0

    private stats: Stats;

    private modules = {
        URL: URL,
        pss: promiseSafeSync,
    };

    public constructor(stats: Stats, options: InlineOptions, maxWorkers: number | null, browser: string = 'chromium') {
        this.stats = stats;

        // @ts-ignore
        this.browsersList['chromium'] = chromium;
        // @ts-ignore
        this.browsersList['firefox'] = firefox;
        // @ts-ignore
        this.browsersList['webkit'] = webkit;

        this.browser = null;
        this.tasksQueue = [];

        if (typeof maxWorkers === "number" && maxWorkers >= 1) {
            this.maxWorkers = maxWorkers;
        } else if (maxWorkers === null) {
            //Get CPU's cores count and multiply by 12
            //12 contexts per cpu
            this.maxWorkers = OS.cpus().length * 12;
        } else {
            console.log(`Wrong maxWorkers: ${maxWorkers}`);
            console.log(`Dying`);
            process.exit(1);
        }

        if (browser === 'chromium' || browser === 'firefox' || browser === 'webkit') {
            (async () => {
                this.browser = await this.browsersList[browser].launch(options);
            })();
        } else {
            console.log(`Wrong browser type: ${browser}`);
            console.log(`Dying`);
            process.exit(1);
        }
    }

    public runTaskManager(): void {
        this.taskManager = setInterval(() => {
            if (this.browser !== null && this.contextsCounter < this.maxWorkers) {
                //@ts-ignore
                let task: Task = this.tasksQueue.shift();
                if (task !== undefined) {
                    task.setRunTime((new Date()).getTime());

                    try {
                        let script = new Function(`(async () => {
                                const context = await this.browser.newContext();
                                this.contextsCounter++;
                                (async function (task, context, TaskDONE, TaskFAIL, modules, stats) {
                                    try {
                                        let data = {};
                                        ${task.getScript()}
                                        if (context !== null && typeof context.close === 'function') {
                                            context.close();
                                        }
                                        this.contextsCounter--;
                                        stats.addSuccess();
                                        task.getCallback()(TaskDONE, data, task.getTaskTime());
                                    }
                                    catch (e) {
                                        if (context !== null && typeof context.close === 'function') {
                                            context.close();
                                        }
                                        this.contextsCounter--;
                                        if (e.name === 'TimeoutError') {
                                            console.log(e);
                                            stats.addTimeout();
                                        }
                                        stats.addFail();
                                        task.getCallback()(TaskFAIL, {'error': 'Fail in script running', 'log': e.toString()}, task.getTaskTime());
                                    }
                                })(arguments[0], context, arguments[1], arguments[2], this.modules, this.stats);
                            })()`);

                        // @ts-ignore
                        script.call(this, task, TaskDONE, TaskFAIL);
                    } catch (e) {
                        this.stats.addFail();
                        task.getCallback()(TaskFAIL, {
                            'error': 'Fail in script calling',
                            'log': e.toString()
                        }, task.getTaskTime());
                    }
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

    public addTask(script: string, callback: (scriptStatus: string, scriptReturn: object, times: TaskTimes) => void, options: object | null = null) {
        if (options === null) {
            options = this.getDefaultBrowserOptions();
        }
        this.stats.addTask();
        this.tasksQueue.push(new Task(script, callback, options));
    }

    public getQueueLength(): number {
        return this.tasksQueue.length;
    }

}
