// @ts-ignore not under root dir
import * as config from '../config.json';
import {chromium, ChromiumBrowser, errors} from "playwright-chromium";
import {BrowserContextOptions, LaunchOptions} from "playwright-chromium/types/types";
import Task, {TaskTimes, DONE as TaskDONE, FAIL as TaskFAIL} from "./Task";
import URL from "url";
import OS from "os";
import {Stats} from "./Stats";
import Context from "./Context";
import ProxyServer from "./ProxyServer";
import ChromeRandomUserAgent from "./modules/ChromeRandomUserAgent";
import Stealth from "./modules/Stealth";
import TimeoutError = errors.TimeoutError;

export interface RunOptions {
    WORKERS_PER_CPU: number,
    MAX_TASK_TIMEOUT: number,
    ACCEPT_LANGUAGE?: string,
    USER_AGENT?: string,
    LAUNCH_OPTIONS: LaunchOptions
}

export default class BrowsersPool {

    private browser: ChromiumBrowser | null = null;
    private localProxyServer: ProxyServer|null = null;

    private readonly maxWorkers: number;
    private tasksQueue: Task[] = [];
    private taskManager: NodeJS.Timeout | null = null;
    private readonly taskTimeout: number;

    private contexts: Context[] = [];

    private stats: Stats;
    private readonly launchOptions: LaunchOptions;

    private browserRunnerFlag: boolean = false;

    private modules = {
        URL: URL,
    };

    public constructor(stats: Stats, runOptions: RunOptions) {

        //Stats init
        stats.setContexts(this.contexts);
        this.stats = stats;

        this.launchOptions = <LaunchOptions>runOptions.LAUNCH_OPTIONS;
        this.launchOptions.timeout = runOptions.MAX_TASK_TIMEOUT;

        this.maxWorkers = runOptions.WORKERS_PER_CPU * OS.cpus().length;
        if (this.maxWorkers < 1) this.maxWorkers = 1;

        this.taskTimeout = runOptions.MAX_TASK_TIMEOUT;

        if (!Array.isArray(this.launchOptions.args)) {
            this.launchOptions.args = [];
        }

        //UserAgent
        if (runOptions.USER_AGENT !== undefined) {
            this.launchOptions.args.push(`--user-agent=${runOptions.USER_AGENT}`);
        }
        else {
            const randomUA = new ChromeRandomUserAgent();
            this.launchOptions.args.push(`--user-agent=${randomUA.getUserAgent()}`)
        }

        //Lang
        if (runOptions.ACCEPT_LANGUAGE !== undefined) {
            this.launchOptions.args.push(`--lang=${runOptions.USER_AGENT}`);
        }
        else {
            this.launchOptions.args.push(`--lang=en-US,en`);
        }

        //Proxy
        if (this.launchOptions.proxy?.server === 'per-context' && process.env.PW_TASK_PROXY === undefined) {
            this.localProxyServer = new ProxyServer();
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
                // @ts-ignore fix for task.getScript()
                let task: Task = this.tasksQueue.shift();
                if (task !== undefined) {
                    task.setRunTime();

                    let statsContext = new Context();
                    this.contexts.push(statsContext);

                    (new Promise<any>(async (resolve, reject) => {
                        try {
                            const contextOption = task.getContextOptions();

                            // @ts-ignore can't be null
                            const context = await this.browser.newContext(contextOption);
                            await Stealth(context);

                            context.on('page', async page => {
                                page.on('console', async msg => {
                                    for (let i = 0; i < msg.args().length; ++i)
                                        console.log(`${i}: ${await msg.args()[i].jsonValue()}`);
                                })
                            })

                            statsContext.setBrowserContext(context);

                            const script = new Function('context', 'modules', 'taskTimeout',
                                `return new Promise(async (resolve, reject) => {
                                        setTimeout(() => {reject('Max Task Timeout')}, taskTimeout);
                                        ${task.getScript()}
                                        resolve({});
                                });`
                            );
                            script(context, this.modules, this.taskTimeout)
                                .then(resolve)
                                .catch(reject);
                        } catch (e) {
                            reject(e);
                        }
                    }))
                        .then(async (response: object) => {
                            statsContext.closeContext();
                            this.stats.addSuccess();
                            this.removeContext(statsContext)
                            task.setDoneTime();

                            if (typeof response !== 'object') {
                                response = {response};
                            }

                            task.getCallback()(TaskDONE, response, task.getTaskTime());
                        })
                        .catch( async (e: any) => {
                            statsContext.closeContext();
                            this.removeContext(statsContext)
                            task.setDoneTime();

                            if (e instanceof TimeoutError) {
                                task.getCallback()(TaskFAIL, {
                                    'error': 'TimeoutError inside script',
                                    'log': e.toString(),
                                    'stack': e.stack
                                }, task.getTaskTime());
                            } else if (e instanceof Error) {
                                task.getCallback()(TaskFAIL, {
                                    'error': `Error inside script | ${e.message}`,
                                    'log': e.toString(),
                                    'stack': e.stack
                                }, task.getTaskTime());
                            } else {
                                task.getCallback()(TaskFAIL, {
                                    'error': `Unprocessable error, see logs`,
                                    'log': JSON.stringify(e),
                                    'stack': 'No stack'
                                }, task.getTaskTime());
                            }
                        });
                }
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

    public addTask(script: string, callback: (scriptStatus: string, scriptReturn: object, times: TaskTimes) => void, options: BrowserContextOptions = {}) {
        if (typeof options.viewport !== 'object') {
            options.viewport = {width: 1920, height: 1080}
        }

        if (typeof options.locale !== 'string') {
            options.locale = config.RUN_OPTIONS.ACCEPT_LANGUAGE;
        }

        if (typeof options.proxy !== 'object') {
            options.proxy = {
                server: process.env.PW_TASK_PROXY ?? `socks5://127.0.0.1:${process.env.LOCAL_PRXOY_PORT}`,
                bypass: process.env.PW_TASK_BYPASS ?? "",
                username: process.env.PW_TASK_USERNAME ?? "",
                password: process.env.PW_TASK_PASSWORD ?? ""
            };
        }

        if (typeof options.userAgent !== 'string') {
            const randomUA = new ChromeRandomUserAgent();
            options.userAgent = randomUA.getUserAgent();
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
