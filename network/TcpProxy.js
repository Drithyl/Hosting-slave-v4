const net = require('net');
const log = require("../logger.js");
require("dotenv").config();

class TcpProxy {
    #dominionsGame;
    #isDominionsProcessStarting;
    #isDominionsServerReady;
    #pendingClients;
    #proxyServer;
    #frontEndPort;

    TcpProxy(frontEndPort, dominionsGame) {
        this.#frontEndPort = frontEndPort;
        this.#dominionsGame = dominionsGame;
        this.#proxyServer = this.#createProxyForPlayerConnections();
    }

    #createProxyForPlayerConnections() {
        const proxy = net.createServer(onIncomingPlayerConnection);
        return proxy;
    }

    isDominionsServerRunning() {
        return this.#dominionsGame.isOnline();
    }

    startDominionsServer() {
        if (this.#isDominionsProcessStarting) {
            return;
        }

        this.#isDominionsProcessStarting = true;
        log.general(log.getLeanLevel(), `Starting Dominions server for game ${this.#dominionsGame.getName()}`);
        this.#dominionsGame.launchProcess();
        
    }

    queuePlayerConnection(clientSocket) {

    }

    proxyPlayerToServer(clientSocket) {

    }
}

function onIncomingPlayerConnection(clientSocket, tcpProxy) {
    const playerIpPort = `${clientSocket.remoteAddress}:${clientSocket.remotePort}`;
    log.general(log.getLeanLevel(), `Incoming player connection from ${playerIpPort}`);

    clientSocket.setTimeout(process.env.CLIENT_TIMEOUT, onIncomingPlayerConnectionTimeout);

    if (!tcpProxy.isDominionsServerRunning()) {
        tcpProxy.startDominionsServer();
        tcpProxy.queuePlayerConnection(clientSocket);
    }

    else {
        tcpProxy.proxyPlayerToServer(clientSocket);
    }
}

function onIncomingPlayerConnectionTimeout(clientSocket) {
    clientSocket.end("Connection timed out\n");
}
