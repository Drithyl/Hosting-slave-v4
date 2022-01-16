
const log = require("./logger.js");
const configStore = require("./config_store.js");
const gameStore = require("./hosted_games_store.js");
const masterCommands = require("./master_commands.js");
const reservedPortsStore = require("./reserved_ports_store.js");
const { TimeoutError, SocketResponseError } = require("./errors.js");

/****************************************
*   SOCKET CONNECTION TO MASTER SERVER  *
****************************************/
const _socketIoObject = require('socket.io-client');
const _masterServerAddress = `http://${configStore.masterIP}:${configStore.masterPort}/`;

//By default, io will try to reconnect forever with a small delay between each attempt
var _socket;
var _timeoutProcess;
var _connectionCheckIntervalId;
var _lastPingTimestamp = Date.now();
const MAX_PING_TIMEOUT = 120000;

exports.connect = () =>
{
    log.general(log.getNormalLevel(), "Attempting to connect to the master server...");
    return Promise.resolve(_createConnection());
};

//No function below will be available until the socket connects successfully
exports.on = (trigger, handler) =>
{
    return new Promise((resolve, reject) =>
    {
        _socket.on(trigger, (data, serverCallback) =>
        {
            Promise.resolve(handler(data))
            .then((handlerReturnValue) => 
            {
                //If handler resolves promise, send the value in the callback with no
                //error in first parameter and resolve the higher promise
                serverCallback(null, handlerReturnValue);
                resolve();
            })
            .catch((err) => 
            {
                //If handler rejects promise, send the message of the resulting error
                //(cannot send the error object as a whole back to master server)
                //and reject the higher promise
                log.error(log.getNormalLevel(), `ERROR FULFILLING '${trigger}' REQUEST`, err);
                serverCallback(err.message);
            });
        });
    });
};

exports.emit = (trigger, data) =>
{
    return new Promise((resolve, reject) =>
    {
        _socket.emit(trigger, data, function responseCallback(err, ...args)
        {
            if (err)
                reject(err);
            
            else resolve(...args);
        });
    });
};

exports.emitPromise = (trigger, data) =>
{
    return new Promise((resolve, reject) =>
    {
        var receivedResponse = false;

        _socket.emit(trigger, data, function handleResponse(errMessage, returnData)
        {
            receivedResponse = true;

            if (errMessage != null)
                return reject(new SocketResponseError(errMessage));

            else return resolve(returnData);
        });

        setTimeout(function handleTimeout()
        {
            if (receivedResponse === false)
                reject(new TimeoutError("No response from socket."));

        }, 60000);
    });
};

function _createConnection()
{
    _socket = _socketIoObject(_masterServerAddress);

    _socket.on("connect", _connectedHandler);
    _socket.on("connect_error", () => log.general(log.getLeanLevel(), `Could not connect to master`));
    _socket.on("disconnect", _disconnectHandler);

    // The events below are fired by the manager object and not the socket object:
    // https://socket.io/docs/v4/client-socket-instance/#events
    _socket.io.on("reconnect", _reconnectHandler);
    _socket.io.on("reconnect_attempt", _reconnectAttemptHandler);
    _socket.io.on("reconnect_failed", _reconnectFailed);
    _socket.io.on("ping", () => 
    {
        _lastPingTimestamp = Date.now();
        log.general(log.getLeanLevel(), `Ping received from master server`);
    });

    // Start an interval to check at regular times whether we're still receiving
    // pings from the master server or not. If we're not, force a reconnection
    _connectionCheckIntervalId = setInterval(_connectionCheck, MAX_PING_TIMEOUT);

    masterCommands.listen(module.exports);
}

function _connectionCheck()
{
    const now = Date.now();

    if (now - _lastPingTimestamp >= MAX_PING_TIMEOUT)
    {
        log.general(log.getLeanLevel(), `${MAX_PING_TIMEOUT}ms elapsed without receiving pings from master server; forcing a manual reconnection...`);
        _socket.disconnect();
        _socket.connect();
    }
}

function _connectedHandler()
{
    log.general(log.getNormalLevel(), `Connected to master server successfully.`);

    if (_timeoutProcess != null)
    {
        log.general(log.getLeanLevel(), `Stopped disconnection timeout`);
        clearTimeout(_timeoutProcess);
    }
}


/******************************
*   DISCONNECTION HANDLING    *
******************************/
function _disconnectHandler(reason)
{
    log.general(log.getLeanLevel(), `Socket disconnected. Reason: ${reason}.`);

    // If the disconnection reason is an explicit one (manually closed the socket,
    // or called socket.disconnect(), then reconnection must be handled manually).
    // Otherwise it will try to reconnect on its own after a small random delay:
    // https://socket.io/docs/v4/client-socket-instance/
    if (reason === "io server disconnect" || reason === "io client disconnect")
    {
        //reconnect if the server dropped the connection
        _socket.connect();
    }

    // Start a timeout of 5 minutes. If after the 5 minutes the socket
    // is still not reconnected, shut down all games and free all ports.
    else
    {
        // If the socket reconnected and disconnected again, 
        // clear the timout and start it up once more
        if (_timeoutProcess != null)
            clearTimeout(_timeoutProcess);

        log.general(log.getLeanLevel(), `Starting timeout to shut down games if no reconnection happens.`);
        _timeoutProcess = setTimeout(() => 
        {
            _timeoutProcess = null;

            if (_socket.connected === false)
            {
                log.general(log.getLeanLevel(), `Socket is still disconnected after timeout; shutting down all games...`);

                // release all reserved ports in assisted hosting instances,
                // because if it's the master server that crashed, when it comes back up
                // the ports will be reserved for no instance
                reservedPortsStore.releaseAllPorts();
                gameStore.killAllGames();
            }

        }, 300000);
    }
}

/****************************
*   RECONNECTION HANDLING   *
****************************/
function _reconnectHandler(attemptNumber)
{
    // No need to relaunch games here as the authentication process will kick in again
    // from the very beginning, on connection, when the master server sends the "init" event
    log.general(log.getLeanLevel(), `Reconnected successfully on attempt ${attemptNumber}.`);
}

function _reconnectAttemptHandler(attemptNumber)
{
    log.general(log.getVerboseLevel(), `Attempting to reconnect...`)
}

// Fired when socket can't reconnect within reconnectionAttempts
function _reconnectFailed()
{
    log.general(log.getLeanLevel(), `Could not reconnect to the master server after all the set reconnectionAttempts.`);
    _socket.connect();
}