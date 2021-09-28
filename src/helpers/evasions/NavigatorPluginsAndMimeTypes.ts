import {ChromiumBrowserContext} from "playwright-chromium";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.addInitScript(function () {
        let mimes: any[] = [
            {
                description: "Native Client",
                suffixes: "",
                type: "application/x-nacl",
                enabledPlugin: {},
                __proto__: MimeType.prototype
            }
        ];
        let plugins: any[] = [
            {
                0: {},
                description: "Portable Document Format",
                filename: "internal-pdf-viewer",
                length: 1,
                name: "Chrome PDF Plugin",
                __proto__: Plugin.prototype
            }
        ];

        const makeRandomInt = (min: number, max: number) => {
            return Math.floor(Math.random() * (max - min)) + min;
        }

        const makeString = (length: number) => {
            let result = '';
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
            const charactersLength = characters.length;
            for (let i = 0; i < length; i++) {
                result += characters.charAt(Math.floor(Math.random() * charactersLength));
            }
            return result;
        }

        const createMimeType = function () {
            let suffixes = [];
            const suffixesCount = makeRandomInt(0, 3);
            for (let i = 0; i < suffixesCount; i++) {
                suffixes.push(makeString(makeRandomInt(2, 5)));
            }

            return {
                description: makeString(makeRandomInt(10, 25)),
                suffixes: suffixes,
                type: "application/" + makeString(makeRandomInt(3, 10)),
                enabledPlugin: {},
                __proto__: MimeType.prototype
            };
        }

        const createPlugin = function () {
            let plugin = {
                0: {},
                description: makeString(makeRandomInt(10, 25)),
                filename: makeString(makeRandomInt(10, 25)),
                length: 1,
                name: makeString(makeRandomInt(10, 25)),
                __proto__: Plugin.prototype
            };

            let mime = createMimeType();

            mime['enabledPlugin'] = plugin;
            plugin[0] = mime;

            mimes.push(mime);
            return plugin;
        }

        const pluginLength = makeRandomInt(3, 10);

        for (let i = 0; i < pluginLength; i++) {
            plugins.push(createPlugin());
        }

        Object.defineProperty(navigator, 'mimeTypes', {
            get: () => {
                let mimeTypeArray: object = {
                    length: mimes.length,
                    __proto__: MimeTypeArray.prototype
                };

                for (let i = 1; i < mimes.length; i++) {
                    // @ts-ignore
                    mimeTypeArray[i] = mimes[i];
                    // @ts-ignore
                    mimeTypeArray[mimes[i].type] = mimes[i];
                }

                return mimeTypeArray;
            },
        });

        Object.defineProperty(navigator, 'plugins', {
            get: () => {
                let pluginsArray: object = {
                    length: mimes.length,
                    __proto__: PluginArray.prototype
                };

                for (let i = 0; i < plugins.length; i++) {
                    // @ts-ignore
                    pluginsArray[i] = plugins[i];
                    // @ts-ignore
                    pluginsArray[plugins[i].filename] = plugins[i];
                }

                return pluginsArray;
            },
        });
    });
}