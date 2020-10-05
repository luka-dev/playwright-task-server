import Context from "./Context";

export class Stats {
    private totalTasks: number = 0;
    private totalTasksSuccessful: number = 0;
    private totalTasksFailed: number = 0;
    private totalTasksTimeout: number = 0;
    private contexts: Context[] = [];


    private readonly runnedAt: number;

    public constructor() {
        this.runnedAt = (new Date).getTime();
    }

    public addTask(): void {
        this.totalTasks++;
    }

    public addSuccess(): void {
        this.totalTasksSuccessful++;
    }

    public addFail(): void {
        this.totalTasksFailed++;
    }

    public addTimeout(): void {
        this.totalTasksTimeout++;
    }

    public getTotalTasks(): number {
        return this.totalTasks;
    }

    public getTotalTasksSuccessful(): number {
        return this.totalTasksSuccessful;
    }

    public getTotalTasksFailed(): number {
        return this.totalTasksFailed;
    }

    public getTotalTasksTimeout(): number {
        return this.totalTasksTimeout;
    }

    public getRunnedAt(): number {
        return this.runnedAt;
    }

    public setContexts(contexts: Context[]): void {
        this.contexts = contexts;
    }

    public getContextsLength(): number {
        return this.contexts.length;
    }


}
