
const log = require("./logger.js");
const config = require("./config.json");
const gameStore = require("./hosted_games_store.js");
const masterCommands = require("./master_commands.js");
const reservedPortsStore = require("./reserved_ports_store.js");
const { TimeoutError, SocketResponseError } = require("./errors.js");

/****************************************
*   SOCKET CONNECTION TO MASTER SERVER  *
****************************************/
const _socketIoObject = require('socket.io-client');
const _masterServerAddress = `http://${config.masterIP}:${config.masterPort}/`;

//By default, io will try to reconnect forever with a small delay between each attempt
var _socket;

exports.connect = () =>
{
    log.general(log.getNormalLevel(), "Attempting to connect to the master server...");
    return _createConnection()
    .then(() =>
    {
        log.general(log.getNormalLevel(), `Connected to master server successfully.`);
        return Promise.resolve();
    });
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
                
                /** Could reject here but would need to handle it in every single handler attached
                reject();*/
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
    return new Promise((resolve, reject) =>
    {
        _socket = _socketIoObject(_masterServerAddress);

        _socket.on("connect", () => resolve());
        _socket.on("connect_error", () => log.general(log.getLeanLevel(), `Could not connect to master`));

        _socket.on("disconnect", _disconnectHandler);
        _socket.on("reconnect", () => _reconnectHandler);
        _socket.on("reconnect_attempt", (attemptNumber) => log.general(log.getVerboseLevel(), `Attempting to reconnect...`));
        _socket.on("reconnect_error", (attemptNumber) => log.general(log.getVerboseLevel(), `Reconnect attempt failed.`));

        //fired when it can't reconnect within reconnectionAttempts
        _socket.on("reconnect_failed", () => log.general(log.getLeanLevel(), `Could not reconnect to the master server after all the set reconnectionAttempts.`));

        masterCommands.listen(module.exports);
    });
}


/******************************
*   DISCONNECTION HANDLING    *
******************************/
function _disconnectHandler(reason)
{
    log.general(log.getLeanLevel(), `Socket disconnected. Reason: ${reason}.`);

    //release all reserved ports in assisted hosting instances,
    //because if it's the master server that crashed, when it comes back up
    //the ports will be reserved for no instance
    reservedPortsStore.releaseAllPorts();
    gameStore.killAllGames();

    if (reason === "io server disconnect")
    {
        //reconnect if the server dropped the connection
        _socket.open();
    }

    //if the reason is "io client disconnect", the socket will try to
    //reconnect automatically, since the reconnection flag in the socket
    //original connection is true
}

/****************************
*   RECONNECTION HANDLING   *
****************************/
function _reconnectHandler(attemptNumber)
{
    //no need to relaunch games here as the authentication process will kick in again
    //from the very beginning, on connection, when the master server sends the "init" event
    log.general(log.getLeanLevel(), `Reconnected successfully on attempt ${attemptNumber}.`);
}