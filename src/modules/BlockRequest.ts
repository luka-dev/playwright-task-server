import {Page} from "playwright-chromium";

export default function (page: Page,
                         blockedResourceTypes: string[] = [
                             'image',
                             'stylesheet',
                             'font'
                         ],
                         blockedUrls: (RegExp | string)[] = []
) {
    page.route('**', route => {
        const url = route.request().url();
        const doctype = route.request().resourceType();

        let needAbort = blockedResourceTypes.includes(doctype);

        for (let i = 0; !needAbort && i < blockedUrls.length; i++) {
            const blockedUrl = blockedUrls[i];
            needAbort = (blockedUrl instanceof RegExp) ? blockedUrl.test(url) : blockedUrl.indexOf(url) > -1;
        }

        if (needAbort) {
            route.abort('aborted');
        } else {
            route.continue();
        }
    });
}