import StatsContext from "./StatsContext";

export class Stats {
    private totalTasks: number = 0;
    private totalTasksSuccessful: number = 0;
    private totalTasksFailed: number = 0;
    private totalTasksTimeout: number = 0;

    private taskPendingTotal: number = 0;
    private taskProcessingTotal: number = 0;

    private contexts: StatsContext[] = [];


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

    public addTaskPending(time: number): void {
        this.taskPendingTotal += time;
    }

    public addTaskProcessing(time: number): void {
        this.taskProcessingTotal += time;
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

    public getTaskPendingAvg(): number {
        return this.taskPendingTotal / (this.totalTasksSuccessful + this.totalTasksFailed + this.totalTasksTimeout);
    }
    public getTaskProcessingAvg(): number {
        return this.taskProcessingTotal / (this.totalTasksSuccessful + this.totalTasksFailed + this.totalTasksTimeout);
    }

    public setContexts(contexts: StatsContext[]): void {
        this.contexts = contexts;
    }

    public getContextsLength(): number {
        return this.contexts.length;
    }


}
