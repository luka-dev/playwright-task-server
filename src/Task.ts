//problem - WebKitBrowserNewContextOptions not exported. Temp solution, just use 'object'
// import {WebKitBrowserNewContextOptions} from "playwright/types/types";

export class Task {

    private readonly script: string;
    private readonly options: object

    public constructor(script: string, browserContextOptions: object) {
        this.script = script;
        this.options = browserContextOptions;
    }

    public getScript(): string {
        return this.script;
    }

    public getBrowserContextOptions(): object {
        return this.options;
    }
}