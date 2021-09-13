import {createServer} from "simple-socks";


export default class ProxyServer {
    private readonly server: SocksServer


    constructor() {
        this.server = createServer();
        this.server.listen(ProxyServer.getPort());
    }

    public static getHost(): string {
        return '127.0.0.1';
    }

    public static getPort(): number {
        return parseInt(process.env.LOCAL_PRXOY_PORT ?? '8888');
    }
}