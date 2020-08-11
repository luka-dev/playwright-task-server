import * as config from "./config.json";
import {WebServer} from "./WebServer";
import BrowsersPool from "./BrowsersPool";

const browsersPool = new BrowsersPool(config.RUN_OPTIONS.INLINE, config.RUN_OPTIONS.MAX_WORKERS, config.RUN_OPTIONS.BROWSER);
browsersPool.runTaskManager();

const webServer = new WebServer(config.SERVER_PORT);

webServer.setAuthKey(config.AUTH_KEY);

webServer.get('/', (request, response) => {
    response.json({
        health: 'ok',
    })
})

webServer.get('/stats', (request, response) => {
    response.json({
        tasks: {
            total: 0,
            successful: 0,
            failed: 0,
            timeout: 0
        },
        queue: 0,
        uptime: 0,
        hardware: {
            cpu: {
                current: 0,
                max: 0
            },
            ram: {
                total: 0,
                current: 0,
                max: 0,
            }
        }
    })
});

webServer.post(`/task`, (request, response) => {
    if (typeof request.body.script === 'string') {

        browsersPool.addTask(request.body.script, (scriptStatus: string, scriptReturn = {}, times) => {
            times.done_at = (new Date).getTime();
            response.json({
                status: scriptStatus,
                stats: {
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
