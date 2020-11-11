import {chromium, ChromiumBrowser} from "playwright-chromium";
import Task, {TaskTimes, DONE as TaskDONE, FAIL as TaskFAIL} from "./Task";
import URL from "url";
import OS from "os";
import {Stats} from "./Stats";
import Context from "./Context";
import contextStealth from "./modules/stealth";


export interface InlineLaunchOptions
{
    headless?: boolean;
    executablePath?: string;
    args?: Array<string>;
    ignoreDefaultArgs?: boolean|Array<string>;
    proxy:null|undefined|{
        server: string;
        bypass?: string;
        username?: string;
        password?: string;
    };
    timeout?: number;
    devtools?: boolean;
    slowMo?: number;
}

export interface RunOptions {
    WORKERS_PER_CPU: number,
    // UA: string;
    // LOCALE: string;
    INLINE: InlineLaunchOptions
}

export default class BrowsersPool {

    private browser: ChromiumBrowser | null = null;

    private readonly maxWorkers: number;
    private tasksQueue: Task[] = [];
    private taskManager: NodeJS.Timeout | null = null;

    private defaultBrowserOptions: object = {};

    private contexts: Context[] = [];

    private stats: Stats;
    private readonly launchOptions: InlineLaunchOptions;

    private browserRunnerFlag: boolean = false;

    private modules = {
        URL: URL,
    };

    public constructor(stats: Stats, runOptions: RunOptions, envOverwrite: boolean = false) {

        //Stats init
        stats.setContexts(this.contexts);
        this.stats = stats;

        this.launchOptions = runOptions.INLINE;

        this.maxWorkers = runOptions.WORKERS_PER_CPU * OS.cpus().length;

        //Proxy
        if (runOptions.INLINE.proxy === null && process.env.PW_TASK_PROXY !== undefined) {
            runOptions.INLINE.proxy = {
                server: process.env.PW_TASK_PROXY,
                bypass: process.env.PW_TASK_BYPASS ?? "",
                username: process.env.PW_TASK_USERNAME ?? "",
                password: process.env.PW_TASK_PASSWORD ?? ""
            };
        } else {
            runOptions.INLINE.proxy = undefined;
        }


        //Browser name checker
        this.runBrowser();
    }

    public removeContext(context: Context) {
        let statsContextIndex = this.contexts.indexOf(context);
        if (statsContextIndex >= 0) this.contexts.splice(statsContextIndex);
    }


    public async runBrowser() {
        if (!this.browserRunnerFlag) {
            this.browserRunnerFlag = true;

            try {
                // @ts-ignore
                this.browser = await chromium.launch(this.launchOptions);
            } catch (e) {
                console.log(`Error in running browser: ${e}`);
                console.log(`Dying`);
                process.exit(1);
            }
            this.browserRunnerFlag = false;
        }
    }

    public async runTaskManager() {
        console.log('Running Task Manager');

        this.taskManager = setInterval(() => {
            if (this.browser !== null && this.browser.isConnected() && this.contexts.length < this.maxWorkers) {
                //@ts-ignore fix for ${task.getScript()}
                let task: Task = this.tasksQueue.shift();
                if (task !== undefined) {
                    task.setRunTime();

                    let statsContext = new Context();
                    this.contexts.push(statsContext);

                    (new Promise<any>(async (resolve, reject) => {
                        try {
                            // @ts-ignore
                            const context = await this.browser.newContext();
                            statsContext.setBrowserContext(context);

                            await contextStealth(context);

                            let script = new Function('context', 'modules',
                                `return new Promise(async (resolve, reject) => {
                                    try {
                                        ${task.getScript()}
                                        resolve({});
                                    }
                                    catch (e) {
                                        reject(e);
                                    }
                                });`
                            );
                            script(context, this.modules)
                                .then(resolve)
                                .catch(reject);
                        } catch (e) {
                            reject(e);
                        }
                    }))
                        .then(async (response: object) => {
                            await statsContext.closeContext();
                            this.stats.addSuccess();
                            this.removeContext(statsContext)
                            task.setDoneTime();

                            if (typeof response !== 'object') {
                                response = {response};
                            }

                            task.getCallback()(TaskDONE, response, task.getTaskTime());
                        })
                        .catch( async (e: any) => {
                            await statsContext.closeContext();
                            this.removeContext(statsContext)
                            task.setDoneTime();

                            if (e instanceof Error) {
                                if (e.message.indexOf('Target.createBrowserContext') >= 0) {
                                    //no runed browser, rerunning doing task
                                    await this.runBrowser();
                                    this.tasksQueue.push(task);
                                } else {
                                    let errorMsg = 'Fail in script calling (runTask)';

                                    if (e.name === 'TimeoutError') {
                                        errorMsg = 'TimeOut in script';
                                        this.stats.addTimeout();
                                    } else {
                                        this.stats.addFail();
                                    }

                                    task.getCallback()(TaskFAIL, {
                                        'error': errorMsg,
                                        'log': e.toString(),
                                        'stack': e.stack
                                    }, task.getTaskTime());
                                }
                            }
                            else {
                                task.getCallback()(TaskFAIL, {
                                    'error': 'Fail in script calling (runTask)',
                                    'log': JSON.stringify(e),
                                    'stack': 'Not an instance of Error',
                                }, task.getTaskTime());
                            }
                        });
                }
            } else if (this.contexts.length >= this.maxWorkers) {
                console.warn('contextsCounter! Waiting');
            } else if (this.browser !== null && !this.browser.isConnected()) {
                this.stopTaskManager();
                this.runBrowser();
                this.runTaskManager();
                console.warn('browser is dead! rerunning');
            }
        }, 10);
        console.log('Runned Task Manager');
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
