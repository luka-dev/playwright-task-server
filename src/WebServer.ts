import express, {Express, Request, Response} from "express";
import helmet from "helmet";
import cors from "cors";
import http from "http";

export interface RouteCallback {
    (request: Request, response: Response): void;
}

export class WebServer {

    private authKey: string | null = null;

    private readonly port: number;
    private app: Express;

    private server: http.Server | null = null;

    public constructor(port: number = 80, useCors: boolean = true) {
        this.port = port;

        this.app = express();

        this.app.use(helmet());

        if (useCors) {
            this.app.use(cors())
        }

        this.app.use(express.json());
        this.app.use(express.json());
        this.app.use(express.urlencoded());
    }

    public setAuthKey(key: string | null = null): void {
        this.authKey = key;
    }

    public checkAuth(request: Request): boolean {
        if (this.authKey === null) {
            return true;
        }

        return request.get('Authorization') === this.authKey;
    }

    public start(): void {
        if (this.server === null) {
            this.server = this.app.listen(this.port);

            if (this.authKey === null) {
                console.log('APP Runned in InSecure mode!');
            }
        }
    }

    public stop(): void {
        if (this.server !== null) {
            this.server.close();
        }
        this.server = null;
    }

    public post(route: string, callback: RouteCallback): void {
        this.app.post(route, (request, response) => {
            if (!this.checkAuth(request)) {
                response.send(401);
            }
            callback(request, response);
        })
    }

    public get(route: string, callback: RouteCallback): void {
        this.app.get(route, (request, response) => {
            if (!this.checkAuth(request)) {
                response.send(401);
            }
            callback(request, response);
        })
    }

}
