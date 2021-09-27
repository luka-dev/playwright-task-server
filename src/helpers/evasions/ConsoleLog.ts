import {ChromiumBrowserContext} from "playwright-chromium";
import {debug as isDebug} from "debug";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    if (isDebug('pw:page_log')) {
        context.on('page', async page => {
            page.on('console', async msg => {
                    let logs = [];
                    for (let i = 0; i < msg.args().length; ++i) {
                        logs.push(await msg.args()[i].jsonValue())
                    }

                    console.log(
                        '\x1b[33m',
                        ' pw:page_log',
                        '\x1b[0m',
                        '=>',
                        `URL: ${msg.location().url ?? 'null'}`,
                        `Line Number: ${msg.location().lineNumber ?? 'null'}`,
                        `Column Number:  ${msg.location().columnNumber ?? 'null'}`,
                        '\n',
                        logs
                    );

            });
        });
    }
}