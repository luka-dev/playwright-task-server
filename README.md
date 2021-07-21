# PLAYWRIGHT task server
It's a Node.Js server that's hold playwright to process tasks (mainly - crawling)

Concept:
- Express hold RESTful API and receive authorized(or not) request with task script
- Add your task to queue (will be runed as soon as any worker will be free)
- Run separate context(incognito env.)
- Run your task script in something like isolated context
- Return to express callback result of task script and answer for your request


Example of request:
>POST to "http://server_address:port/task"
>
>Content-Type: application/x-www-form-urlencoded

if in config.json AUTH_KEY is not null, add header
>Authorization: HERE_AUTH_KEY

in form, field with name 'script'

Example of request
```js
fetch("http://server_address:port/task", {
  "method": "POST",
  "headers": {
    "content-type": "application/x-www-form-urlencoded",
    "authorization": "HERE_AUTH_KEY"
  },
  "body": {
      "options": {
          "proxy": {
              "server": "PROTOCOL://ADDRESS:PORT", 
              "bypass": "", 
              "username": "USERNAME", 
              "password": "PASSWORD"
          }
      }, 
      "script": "HERE_IS_SCRIPT"
  }
});
```

Example of script [(playwright docs)](https://playwright.dev/)
```js
//Creating page inside context
const page = await context.newPage();

//Preparing key's for data storage
let data = {
    hosts: [],
    res: [],
    ip: null
};

//Structure, that's listen all requests, and block everything except HTML and log req.
page.route('**', route => {
    
    //Used module.URL (instance of node.js URL)
    data.hosts.push(modules.URL.parse(route.request().url()).hostname);
    
    if (route.request().resourceType() !== 'document') 
    {
       route.abort('aborted');
    }
    else {
      data.res.push(route.request().resourceType());
      route.continue();
    }
});

//Open 2ip main page and waiting for load
await page.goto('https://2ip.ru/');

//Extracting ip from html
data.ip = (await page.$('div.ip')).innerText();

//End script execution and tranfer back data
//also can be reject in case of script failure
resolve(data);
``` 
Var `data` locally created and puted throw resolve. Everything from var, will be displayed in response. 
All manually created var's/const's/e.t.c. inside script will be ignored in response.

Also task server support `modeules`, custom libs set, that will be available inside runed script context.

### config.json
##### Proxy
In config, proxy property can be `null`, `object` or `per-context` (default: `per-context`), follow this [docs](https://playwright.dev/docs/api/class-browsertype#browser-type-launch-option-proxy).
Example of proxy object
```json
{
        "server": "hostname:port",
        "bypass": "",
        "username": "usernameForProxy",
        "password": "passwordForProxy"
}
```

Proxy per-context configuration [docs](https://playwright.dev/docs/api/class-browser#browser-new-context-option-proxy)

To set GLOBAL proxy, use ENV

In case of unnecessary authorization with username & password, fields `username` and `password` can be skipped or can be `null`

##### Env

> PW_TASK_KEY - Key for Authorization
> 
> PW_TASK_PORT - Running port
> 
> PW_TASK_PROXY - Proxy hostname:port
> 
> PW_TASK_USERNAME - Proxy username
> 
> PW_TASK_PASSWORD - Proxy password

### Additional
[PHP-Lib](https://github.com/luka-dev/playwright-php) for generating simple task script. (lib cover min. req.)

### todo
- Submit issues with ideas