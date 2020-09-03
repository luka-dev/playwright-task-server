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
    private readonly hostname: string;
    private app: Express;

    private server: http.Server | null = null;

    public constructor(port: number|null = 80, hostname: string = 'localhost', useCors: boolean = true) {
        if (port !== null)
        {
            this.port = port;
        } else {
            let envPort = process.env.PORT;
            if (envPort === undefined) {
                throw new Error('no port');
            }
            this.port = parseInt(envPort);
        }
        this.hostname = hostname;

        this.app = express();

        this.app.use(helmet());

        if (useCors) {
            this.app.use(cors())
        }

        this.app.use(express.json());
        this.app.use(express.urlencoded({ extended: true }));
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
            this.server = this.app.listen(this.port, this.hostname);

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
