# PLAYWRIGHT task server
It's a Node.Js server that's hold playwright to precess tasks (mainly - crawling)

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
fetch("http://localhost/task", {
  "method": "POST",
  "headers": {
    "content-type": "application/x-www-form-urlencoded",
    "authorization": "HERE_AUTH_KEY"
  },
  "body": {
    "script": "HERE_IS_SCRIPT"
  }
```

Example of script [(playwright docs)](https://playwright.dev/)
```js
//Creating page inside context
const page = await modules.pss(context.newPage());

//Preparing key's for data
data.hosts = [];
data.res = [];

//Structure, that's listen all requests, and block everything except HTML and log req.
page.route('**', route => {
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
await modules.pss(page.goto('https://2ip.ru/'));

//Extracting ip from html
data.ip = await (await modules.pss(page.$('div.ip'))).innerText();
``` 
Var `data` predifined and evrything that will be saved in her, will be displayed in response. All manually created var's/const's/e.t.c. inside script will be ignored in response.   

`modules.pss` it's my solution to resolve problems with not catched `reject` in Promises.
This overhead catch `reject`'s and send `throw` that can be cathced by try/catch

Also task server support "modeules" custom lib that will be available inside runed script context.

### Additional
[PHP-Lib](https://github.com/luka-dev/playwright-php) for generating simple task script. (lib cover min. req.)

### todo
- [ ] add flexible support for proxy in config
- [ ] add google recaptcha solver
