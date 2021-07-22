/// <reference types="node" />



declare module 'simple-socks' {
    export function createServer(options?: object): SocksServer;
}

interface SocksServer {
    listen(port: number): SocksServer,
}