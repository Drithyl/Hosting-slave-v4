
const config = require("./config.json");
const rw = require("./reader_writer.js");
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
    console.log("Attempting to connect to the master server...");
    return _connect()
    .then((connectedSocket) =>
    {
        console.log(`Connected to master server successfully.`);
        _socket = connectedSocket;
        
        //return this whole module as wrapper
        return Promise.resolve(module.exports);
    })
    .catch((err) => Promise.reject(err));
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
                console.log(`Error when fulfilling '${trigger}' request: ${err.message}\n\n${err.stack}`);
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

function _connect()
{
    return new Promise((resolve, reject) =>
    {
        const socket = _socketIoObject(_masterServerAddress);

        socket.on("connect", () => resolve(socket));
        socket.on("connect_error", () => reject(`Could not connect to master`));

        _attachReconnectionHandlers(socket);
    });
}

function _attachReconnectionHandlers(connectedSocket)
{
    /******************************
    *   DISCONNECTION HANDLING    *
    ******************************/
    connectedSocket.on("disconnect", (reason) =>
    {
        rw.log("general", `Socket disconnected. Reason: ${reason}.`);

        //release all reserved ports in assisted hosting instances,
        //because if it's the master server that crashed, when it comes back up
        //the ports will be reserved for no instance
        reservedPortsStore.releaseAllPorts();

        if (reason === "io server disconnect")
        {
        //reconnect if the server dropped the connection
        _connect();
        }

        //if the reason is "io client disconnect", the socket will try to
        //reconnect automatically, since the reconnection flag in the socket
        //original connection is true
    });


    /****************************
    *   RECONNECTION HANDLING   *
    ****************************/
    connectedSocket.on("reconnect", (attemptNumber) =>
    {
        //no need to relaunch games here as the authentication process will kick in again
        //from the very beginning, on connection, when the master server sends the "init" event
        rw.log("general", `Reconnected successfully on attempt ${attemptNumber}.`);
    });

    connectedSocket.on("reconnect_attempt", (attemptNumber) => console.log(`Attempting to reconnect...`));
    connectedSocket.on("reconnect_error", (attemptNumber) => console.log(`Reconnect attempt failed.`));

    //fired when it can't reconnect within reconnectionAttempts
    connectedSocket.on("reconnect_failed", () => rw.log("general", `Could not reconnect to the master server after all the set reconnectionAttempts.`));
}