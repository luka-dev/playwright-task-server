import {createServer} from "simple-socks";


export default class ProxyServer {
    private readonly server: SocksServer


    constructor() {
        if (typeof process.env.LOCAL_PRXOY_PORT !== 'string') {
            process.env.LOCAL_PRXOY_PORT = '8888';
        }

        this.server = createServer();
        this.server.listen(parseInt(process.env.LOCAL_PRXOY_PORT));
    }

    public getAddress(): string
    {
        return 'localhost';
    }

    public getPort(): number
    {
        return parseInt(process.env.LOCAL_PRXOY_PORT ?? '8888');
    }
}