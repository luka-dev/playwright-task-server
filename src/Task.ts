import {BrowserContextOptions, LaunchOptions} from "playwright-chromium/types/types";

export const DONE = 'DONE';
export const FAIL = 'FAIL';

export interface TaskTimes {
    created_at: number;
    runed_at: number | null;
    done_at: number | null;
}

export default class Task {

    private readonly script: string;
    private options: BrowserContextOptions

    private readonly createTime: number;
    private runTime: number | null = null;
    private doneTime: number | null = null;

    private readonly callback: (scriptStatus: string, scriptReturn: object, times: TaskTimes) => void;

    public constructor(script: string, callback: (scriptStatus: string, scriptReturn: object, times: TaskTimes) => void, browserContextOptions: BrowserContextOptions = {}) {
        this.script = script;
        this.callback = callback;
        this.options = browserContextOptions;
        this.createTime = (new Date()).getTime();
    }

    public getScript(): string {
        return this.script;
    }

    public getContextOptions(): BrowserContextOptions {
        return this.options;
    }

    public setContextOptions(options: BrowserContextOptions) {
        this.options = options;
    }

    public getCallback() {
        return this.callback;
    }

    public getTaskTime(): TaskTimes {
        return {
          created_at: this.getCreateTime(),
          runed_at: this.getRunTime(),
          done_at: this.getDoneTime(),
        };
    }

    public setRunTime(timestamp: number|null = null) {
        if (timestamp === null) {
            timestamp = (new Date).getTime();
        }

        this.runTime = timestamp;
    }

    public setDoneTime(timestamp: number|null = null) {
        if (timestamp === null) {
            timestamp = (new Date).getTime();
        }

        this.doneTime = timestamp;
    }

    public getCreateTime(): number {
        return this.createTime;
    }

    public getRunTime(): number | null {
        return this.runTime;
    }
    public getDoneTime(): number | null {
        return this.doneTime;
    }

}
