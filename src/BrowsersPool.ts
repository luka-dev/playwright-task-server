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
import OS, {type} from "os";
import {Stats} from "./Stats";

interface ProxyOptions {
    "server": string,
    "bypass": string,
    "username": string,
    "password": string
}

interface InlineOptions {
    args: string[],
    headless: boolean,
    ignoreHTTPSErrors: boolean,
    slowMo: number,
    proxy: ProxyOptions|null|undefined
}

interface RunOptions {
    MAX_WORKERS: number|null,
    BROWSER: string,
    INLINE: InlineOptions
}

export default class BrowsersPool {

    private browser: ChromiumBrowser | FirefoxBrowser | WebKitBrowser | null = null;
    private defaultBrowserOptions: object = {};

    private readonly maxWorkers: number;

    private ignoreHTTPSError: boolean = true;

    private tasksQueue: Task[] = [];
    private taskManager: NodeJS.Timeout | null = null;

    private contextsCounter: number = 0

    private stats: Stats;

    private modules = {
        URL: URL,
        pss: promiseSafeSync,
    };

    public constructor(stats: Stats, runOptions: RunOptions, envOverwrite: boolean = false) {
        this.stats = stats;

        this.ignoreHTTPSError = runOptions.INLINE.ignoreHTTPSErrors;

        let browsersList = {
            chromium: chromium,
            firefox: firefox,
            webkit: webkit,
        }

        this.browser = null;
        this.tasksQueue = [];

        //Max Workers
        if (typeof runOptions.MAX_WORKERS === "number" && runOptions.MAX_WORKERS >= 1) {
            this.maxWorkers = runOptions.MAX_WORKERS;
            // @ts-ignore
            if (process.env.WORKERS !== undefined && envOverwrite && parseInt(process.env.WORKER) >= 1) {
                // @ts-ignore
                this.maxWorkers = parseInt(process.env.WORKER);
            }
        }
        // @ts-ignore
        else if (process.env.WORKERS !== undefined && parseInt(process.env.WORKER) >= 1) {
            // @ts-ignore
            this.maxWorkers = parseInt(process.env.WORKER);
        } else if (OS.cpus().length >= 1) {
            this.maxWorkers = OS.cpus().length * 12;
        } else {
            console.log(`Wrong maxWorkers: ${runOptions.MAX_WORKERS}`);
            console.log(`Dying`);
            process.exit(1);
        }

        if (runOptions.INLINE.proxy === null && process.env.PROXY !== undefined) {
            runOptions.INLINE.proxy = {
                server: process.env.PROXY,
                bypass: process.env.BYPASS ?? "",
                username: process.env.USERNAME ?? "",
                password: process.env.PASSWORD ?? ""
            };
        } else {
            runOptions.INLINE.proxy = undefined;
        }

        if (runOptions.BROWSER === 'chromium' || runOptions.BROWSER === 'firefox' || runOptions.BROWSER === 'webkit') {
            // @ts-ignore
            browsersList[runOptions.BROWSER].launch(runOptions.INLINE)
                .then((runnedBrowser: ChromiumBrowser | FirefoxBrowser | WebKitBrowser) => {
                    this.browser = runnedBrowser;
                })
                .catch((e: any) => {
                    console.log(`Error in running browser: ${e}`);
                    console.log(`Dying`);
                    process.exit(1);
                })
        } else {
            console.log(`Wrong browser type: ${runOptions.BROWSER}`);
            console.log(`Dying`);
            process.exit(1);
        }
    }

    public runTaskManager(): void {

        console.log('Runnung Task Manager');

        this.taskManager = setInterval(() => {
            if (this.browser !== null && this.contextsCounter < this.maxWorkers) {
                //@ts-ignore
                let task: Task = this.tasksQueue.shift();
                if (task !== undefined) {
                    task.setRunTime((new Date()).getTime());

                    try {
                        let script = new Function(`(async () => {
                                const context = await this.browser.newContext({ignoreHTTPSErrors: arguments[3]});
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
                        script.call(this, task, TaskDONE, TaskFAIL, this.ignoreHTTPSError);
                    } catch (e) {
                        this.contextsCounter--;
                        this.stats.addFail();
                        task.getCallback()(TaskFAIL, {
                            'error': 'Fail in script calling',
                            'log': e.toString()
                        }, task.getTaskTime());
                    }
                }
            }
        }, 10);
        console.log('Runned');
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

    public getWorkersCount(): number {
        return this.maxWorkers;
    }

}
