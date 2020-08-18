export const DONE = 'DONE';
export const FAIL = 'FAIL';

export interface TaskTimes {
    created_at: number;
    runed_at: number | null;
    done_at: number | null;
}

export default class Task {

    private readonly script: string;
    private readonly options: object
    private readonly createTime: number;
    private readonly callback: (scriptStatus: string, scriptReturn: object, times: TaskTimes) => void;
    private runTime: number | null = null;

    public constructor(script: string, callback: (scriptStatus: string, scriptReturn: object, times: TaskTimes) => void, browserContextOptions: object) {
        this.script = script;
        this.callback = callback;
        this.options = browserContextOptions;
        this.createTime = (new Date()).getTime();
    }

    public getScript(): string {
        return this.script;
    }

    public getBrowserContextOptions(): object {
        return this.options;
    }

    public getCallback() {
        return this.callback;
    }

    public getTaskTime(): TaskTimes {
        return {
          created_at: this.getCreateTime(),
          runed_at: this.getRunTime(),
          done_at: null,
        };
    }

    public setRunTime(timestamp: number) {
        this.runTime = timestamp;
    }

    public getCreateTime(): number {
        return this.createTime;
    }

    public getRunTime(): number | null {
        return this.runTime;
    }
}
