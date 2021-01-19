export interface EvasionMonitorStatus {
    evasionName: string,
    isExecuted: boolean,
    isCrashed: boolean,
    crashError: Error | null,
}

export default class EvasionMonitor {
    private evasionExecuted = false;
    private evasionCrashed = false;
    private crashError: Error | null = null;
    private readonly evasionName: string;

    constructor(evasionName: string) {
        this.evasionName = evasionName;
    }

    public getEvasionName(): string {
        return this.evasionName;
    }

    public declareEvasionExecuted() {
        this.evasionExecuted = true;
    }

    public declareEvasionCrash(error: Error) {
        this.evasionCrashed = true;
        this.crashError = error;
    }

    public isEvasionExecuted(): boolean {
        return this.evasionExecuted;
    }

    public isEvasionCrashed(): boolean {
        return this.evasionCrashed;
    }

    public getCrashError(): Error | null {
        return this.crashError;
    }

    public toPrintableObj(): EvasionMonitorStatus {
        return {
            evasionName: this.evasionName,
            isExecuted: this.evasionExecuted,
            isCrashed: this.evasionCrashed,
            crashError: this.crashError
        }
    }
}