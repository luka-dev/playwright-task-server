import {ChromiumBrowserContext} from "playwright-chromium";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.addInitScript(function () {
        function randomInteger(min: number, max: number) {
            let rand = min + Math.random() * (max + 1 - min);
            return Math.floor(rand);
        }

        const getParameter = WebGLRenderingContext.prototype.getParameter;
        WebGLRenderingContext.prototype.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) {
                return 'Google Inc. (NVIDIA)';
            }
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) {
                const gpus = [
                    'Titan',
                    '1080 Ti',
                    '1080',
                    '1070 Ti',
                    '1070',
                    '1060',
                    '1050 Ti',
                    '1050',
                    '1030',
                    '980 Ti',
                    '980',
                    '970',
                    '960',
                    '950',
                    '780 Ti',
                    '780',
                    '770',
                    '760 Ti',
                    '760',
                    '750 Ti',
                    '750',
                    '745',
                    '740',
                    '730',
                    '720',
                    '710',
                ];
                return 'Nvidia GTX ' + gpus[randomInteger(0, gpus.length - 1)];
            }

            return getParameter(parameter);
        };

        const getParameter2d = WebGL2RenderingContext.prototype.getParameter;
        WebGL2RenderingContext.prototype.getParameter = function (parameter) {
            // UNMASKED_VENDOR_WEBGL
            if (parameter === 37445) {
                return 'Google Inc. (NVIDIA)';
            }
            // UNMASKED_RENDERER_WEBGL
            if (parameter === 37446) {
                const gpus = [
                    'Titan',
                    '1080 Ti',
                    '1080',
                    '1070 Ti',
                    '1070',
                    '1060',
                    '1050 Ti',
                    '1050',
                    '1030',
                    '980 Ti',
                    '980',
                    '970',
                    '960',
                    '950',
                    '780 Ti',
                    '780',
                    '770',
                    '760 Ti',
                    '760',
                    '750 Ti',
                    '750',
                    '745',
                    '740',
                    '730',
                    '720',
                    '710',
                ];
                return 'Nvidia GTX ' + gpus[randomInteger(0, gpus.length - 1)];
            }

            return getParameter2d(parameter);
        };
    })
}