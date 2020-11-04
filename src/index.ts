// @ts-ignore not under root dir
import * as config from "./../config.json";
import {WebServer} from "./WebServer";
import BrowsersPool, {RunOptions} from "./BrowsersPool";
import OS, {cpus} from "os";
import {Stats} from "./Stats";
import Task, {TaskTimes} from "./Task";

const stats = new Stats();

const browsersPool = new BrowsersPool(stats, <RunOptions>config.RUN_OPTIONS, config.ENV_OVERWRITE);
browsersPool.runTaskManager();

const webServer = new WebServer(config.SERVER_PORT, config.ENV_OVERWRITE);

webServer.setAuthKey(config.AUTH_KEY, true);

webServer.get('/', (request, response) => {
    response.json({
        health: 'ok',
    })
})

webServer.get('/stats', (request, response) => {
    response.json({
        tasks: {
            queue: browsersPool.getQueueLength(),
            'max-workers': OS.cpus().length * config.RUN_OPTIONS.MAX_WORKERS_PER_CORE,
            total: stats.getTotalTasks(),
            processing: browsersPool.getContextsLength(),
            successful: stats.getTotalTasksSuccessful(),
            failed: stats.getTotalTasksFailed(),
            timeout: stats.getTotalTasksTimeout()
        },
        uptime: OS.uptime(),
        hardware: {
            platform: OS.platform(),
            arch: OS.arch(),
            cpu: {
                cores: OS.cpus(),
                avg: {
                    '1': OS.loadavg()[0],
                    '5': OS.loadavg()[1],
                    '15': OS.loadavg()[2]
                }
            },
            ram: {
                total: OS.totalmem(),
                current: OS.totalmem() - OS.freemem(),
                free: OS.freemem(),
            }
        }
    })
});

webServer.post(`/task`, (request, response) => {
    if (typeof request.body.script === 'string') {
        browsersPool.addTask(request.body.script, (scriptStatus: string, scriptReturn = {}, times: TaskTimes) => {
            times.done_at = (new Date).getTime();
            response.json({
                status: scriptStatus,
                metadata: {
                    ...times
                },
                data: {
                    ...scriptReturn
                }
            });
        });
    } else {
        response.json({
            status: 'WRONG_INPUT'
        })
    }

})

webServer.start();
