import * as config from "./config.json";
import {WebServer} from "./WebServer";
import BrowsersPool from "./BrowsersPool";

const browsersPool = new BrowsersPool(config.RUN_OPTIONS.args, config.RUN_OPTIONS.MAX_WORKERS);

browsersPool.runTasker();


const webServer = new WebServer(config.SERVER_PORT);

browsersPool.stopTasker();
// webServer.setAuthKey(config.AUTH_KEY);

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

webServer.post('/task', (request, response) => {

})

webServer.start();