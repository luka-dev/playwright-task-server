// @ts-ignore not under root dir
import * as config from "./../config.json";
import {WebServer} from "./WebServer";
import BrowsersPool, {RunOptions} from "./BrowsersPool";
import OS from "os";
import {Stats} from "./Stats";
import {TaskTimes} from "./Task";

const stats = new Stats();

const browsersPool = new BrowsersPool(stats, <RunOptions>config.RUN_OPTIONS, config.ENV_OVERWRITE);

(async () => {
    await browsersPool.runBrowser();
    await browsersPool.runTaskManager();
})();

const webServer = new WebServer(config.SERVER_PORT, config.ENV_OVERWRITE);

webServer.setAuthKey(config.AUTH_KEY, true);

webServer.get('/', (request, response) => {
    response.json({
        health: 'ok',
    })
})

webServer.get('/stats', (request, response) => {
    response.json({

        requests: {
            total: stats.getTotalTasks(),
            processed: stats.getTotalTasksSuccessful() + stats.getTotalTasksFailed() + stats.getTotalTasksTimeout(),
            successful: stats.getTotalTasksSuccessful(),
            failed: stats.getTotalTasksFailed(),
            timeout: stats.getTotalTasksTimeout()
        },

        handlers: {
            queue: browsersPool.getQueueLength(),
            contexts: stats.getContextsLength(),
            workers: browsersPool.getWorkersCount(),
            pending_avg: stats.getTaskPendingAvg(),
            processing_avg: stats.getTaskProcessingAvg(),
        },

        server: {
            uptime: OS.uptime(),
            platform: OS.platform(),
            arch: OS.arch()
        },

        hardware: {
            cpus: OS.cpus(),
            ram: {
                total: OS.totalmem(),
                current: OS.totalmem() - OS.freemem(),
            }
        },

    })
});

webServer.post(`/task`, (request, response) => {
    if (typeof request.body.script === 'string') {
        browsersPool.addTask(request.body.script, (scriptStatus: string, scriptReturn = {}, times: TaskTimes) => {

            // @ts-ignore already cant be null, we setted this value
            stats.addTaskPending(times.runed_at - times.created_at);
            // @ts-ignore already cant be null, we setted this value
            stats.addTaskProcessing(times.done_at - times.runed_at);

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
