import {ChromiumBrowserContext} from "playwright-chromium";

export default async function (context: ChromiumBrowserContext): Promise<void> {
    await context.addInitScript(function () {
        const originalQuery = window.navigator.permissions.query;
        // @ts-ignore
        window.navigator.permissions.query = function (parameters: PermissionDescriptor | DevicePermissionDescriptor | MidiPermissionDescriptor | PushPermissionDescriptor) {
            if (parameters.name === 'notifications') {
                return Promise.resolve({state: Notification.permission});
            } else {
                return originalQuery(parameters);
            }
        };
    });
}