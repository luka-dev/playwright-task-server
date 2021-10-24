// @ts-ignore not under root dir
import * as config from '../config.json';
import {chromium, ChromiumBrowser, ChromiumBrowserContext, errors} from "playwright-chromium";
import {BrowserContextOptions, LaunchOptions} from "playwright-chromium/types/types";
import Task, {TaskTimes, DONE as TaskDONE, FAIL as TaskFAIL} from "./Task";
import URL from "url";
import OS from "os";
import {Stats} from "./Stats";
import StatsContext from "./StatsContext";
import ProxyServer from "./ProxyServer";
import ChromeRandomUserAgent from "./helpers/ChromeRandomUserAgent";
import StealthPrepareOptions from "./helpers/StealthPrepareOptions";
import StealthWrapContext from "./helpers/StealthWrapContext";
import TimeoutError = errors.TimeoutError;
import tmp from "tmp";
import * as fs from "fs";
import {execSync} from "child_process";
import BlockRequest from "./modules/BlockRequest";
import {debug as isDebug} from "debug";

export interface RunOptions {
    WORKERS_PER_CPU: number,
    MAX_TASK_TIMEOUT: number,
    ACCEPT_LANGUAGE?: string,
    USER_AGENT?: string,
    LAUNCH_OPTIONS: LaunchOptions
}

export default class BrowsersPool {

    private browser: ChromiumBrowser | null = null;
    private localProxyServer: ProxyServer | null = null;

    private readonly maxWorkers: number;
    private tasksQueue: Task[] = [];
    private taskManager: NodeJS.Timeout | null = null;
    private readonly taskTimeout: number;

    private statsContexts: StatsContext[] = [];

    private stats: Stats;
    private readonly launchOptions: LaunchOptions;

    private browserRunnerFlag: boolean = false;

    private modules = {
        URL: URL,
        'blockRequest': BlockRequest
    };

    private static fatalError(task: Task): void {
        task.getCallback()(TaskFAIL, {
            'error': `Fatal Error | unhandledRejection`,
            'log': JSON.stringify('FATAL'),
            'stack': 'No stack'
        }, task.getTaskTime());
    }

    public constructor(stats: Stats, runOptions: RunOptions) {
        //Init Error handler
        process.on('unhandledRejection', () => {
            this.tasksQueue.forEach(task => BrowsersPool.fatalError(task));
            process.exit(1);
        });

        //Stats init
        stats.setContexts(this.statsContexts);
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
        } else {
            const randomUA = new ChromeRandomUserAgent();
            this.launchOptions.args.push(`--user-agent=${randomUA.getUserAgent()}`)
        }

        //Lang
        if (runOptions.ACCEPT_LANGUAGE !== undefined) {
            this.launchOptions.args.push(`--lang=${runOptions.USER_AGENT}`);
        } else {
            this.launchOptions.args.push(`--lang=en-US,en`);
        }

        //Proxy
        if (this.launchOptions.proxy?.server === 'per-context' && process.env.PW_TASK_PROXY === undefined) {
            this.localProxyServer = new ProxyServer();
        }

        //Browser name checker
        this.runBrowser();
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

    private removeStatsContext(context: StatsContext) {
        const statsContextIndex = this.statsContexts.indexOf(context);
        if (statsContextIndex >= 0) this.statsContexts.splice(statsContextIndex);
    }

    private async newStatsContext(task: Task): Promise<StatsContext> {
        if (this.browser === null) {
            throw new Error('this.browser does not exist');
        }

        task.setRunTime();
        const statsContext = new StatsContext();
        const contextOption = task.getContextOptions();

        StealthPrepareOptions(contextOption);
        const context = await this.browser.newContext(contextOption);
        await StealthWrapContext(context, contextOption);

        statsContext.setBrowserContext(context);
        this.statsContexts.push(statsContext);

        return statsContext;
    }

    private static checkScriptSyntax(script: string): boolean {
        //todo passthrough stack log
        const tmpObject = tmp.fileSync({
            prefix: 'playwright-task-server',
            postfix: '.js'
        });
        fs.writeSync(tmpObject.fd, `async () => {;\n${script}\n;}`);

        try {
            execSync(`node --check ${tmpObject.name}`);
            tmpObject.removeCallback();
            return true;
        } catch (e) {
            tmpObject.removeCallback();
            return false;
        }
    }

    private runScript(script: string, context: ChromiumBrowserContext): Promise<any> {
        return (new Function(
                'context', 'modules', 'taskTimeout',
                `return new Promise(async (resolve, reject) => {
                                        setTimeout(() => {reject('Max Task Timeout')}, taskTimeout);
                                        try {
                                            ${script}
                                            resolve({});
                                        } catch (e) {
                                            reject(e);
                     2                   }
                                });`)
        )(context, this.modules, this.taskTimeout);
    }

    public async runTaskManager() {
        console.log('Running Task Manager');

        this.taskManager = setInterval(async () => {
            if (this.browser !== null && this.browser.isConnected() && this.statsContexts.length < this.maxWorkers) {
                const task: Task | undefined = this.tasksQueue.shift();
                if (task !== undefined) {
                    if (BrowsersPool.checkScriptSyntax(task.getScript())) {
                        const statsContext = await this.newStatsContext(task);
                        //@ts-ignore we are already have context
                        this.runScript(task.getScript(), statsContext.getBrowserContext())
                            .then(async (response: object) => {
                                statsContext.closeContext(); //Do not wait
                                this.stats.addSuccess();
                                this.removeStatsContext(statsContext)
                                task.setDoneTime();

                                if (typeof response !== 'object') {
                                    response = {response};
                                }

                                task.getCallback()(TaskDONE, response, task.getTaskTime());
                            })
                            .catch(async (e: any) => {
                                statsContext.closeContext();
                                this.removeStatsContext(statsContext)
                                task.setDoneTime();

                                if (e instanceof TimeoutError) {
                                    this.stats.addTimeout();
                                    const error = {
                                        'error': 'TimeoutError inside script',
                                        'log': e.toString(),
                                        'stack': e.stack
                                    };
                                    if (isDebug("pw:error_response")) {
                                        console.error(error);
                                    }
                                    task.getCallback()(TaskFAIL, error, task.getTaskTime());
                                } else if (e instanceof Error) {
                                    this.stats.addFail();
                                    const error = {
                                        'error': `Error inside script | ${e.message}`,
                                        'log': e.toString(),
                                        'stack': e.stack
                                    };
                                    if (isDebug("pw:error_response")) {
                                        console.error(error);
                                    }
                                    task.getCallback()(TaskFAIL, error, task.getTaskTime());
                                } else {
                                    this.stats.addFail();
                                    const error = {
                                        'error': `Unprocessable error, see logs`,
                                        'log': JSON.stringify(e),
                                        'stack': 'No stack'
                                    };
                                    if (isDebug("pw:error_response")) {
                                        console.error(error);
                                    }
                                    task.getCallback()(TaskFAIL, error, task.getTaskTime());
                                }
                            });
                    } else {
                        this.stats.addFail();
                        const error = {
                            'error': `Script Error | Check Syntax`,
                            'log': 'No log',
                            'stack': 'No stack'
                        };
                        if (isDebug("pw:error_response")) {
                            console.error(error);
                        }
                        task.getCallback()(TaskFAIL, error, task.getTaskTime());
                    }
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
                server: process.env.PW_TASK_PROXY ?? `socks5://${ProxyServer.getHost()}:${ProxyServer.getPort()}`,
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
