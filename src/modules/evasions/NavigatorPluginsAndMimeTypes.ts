import {CDPSession, ChromiumBrowserContext, Page} from "playwright-core";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.addInitScript(function () {
        let ChromiumPDFPluginMime = {
            description: "Native Client Executable",
            suffixes: "",
            type: "application/x-nacl",
            enabledPlugin: {},
            __proto__: MimeType.prototype
        };

        Object.defineProperty(navigator, 'plugins', {
            get: () => {

                let ChromiumPDFPlugin = {
                    0: {},
                    description: "Portable Document Format",
                    filename: "internal-pdf-viewer",
                    length: 1,
                    name: "Chrome PDF Plugin",
                    __proto__: Plugin.prototype
                };

                ChromiumPDFPluginMime['enabledPlugin'] = ChromiumPDFPlugin;
                ChromiumPDFPlugin[0] = ChromiumPDFPluginMime;

                return {
                    0: ChromiumPDFPlugin,
                    'Chrome PDF Plugin': ChromiumPDFPlugin,
                    length: 1,
                    __proto__: PluginArray.prototype
                };
            },
        });

        Object.defineProperty(navigator, 'mimeTypes', {
            get: () => {
                return {
                    0: ChromiumPDFPluginMime,
                    'application/x-nacl': ChromiumPDFPluginMime,
                    length: 1,
                    __proto__: MimeTypeArray.prototype
                };
            },
        });
    });
}