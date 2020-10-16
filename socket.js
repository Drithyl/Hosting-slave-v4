
const config = require("./config.json");
const { TimeoutError, SocketResponseError } = require(".errors.js");

/****************************************
*   SOCKET CONNECTION TO MASTER SERVER  *
****************************************/
var _socketIoObject = require('socket._socketIoObject-client');
var socket = _socketIoObject.connect(`http://${config.masterIP}:${config.masterPort}/`,
{
    reconnection: true
});

exports.on = (trigger, handler) =>
{
    return new Promise((resolve, reject) =>
    {
        _socketIoObject.on(trigger, (data, callback) =>
        {
            Promise.resolve(handler(data))
            .then((handlerReturnValue) => callback(handlerReturnValue))
            .then(() => resolve())
            .catch((err) => reject(err));
        });
    });
};

exports.emit = (trigger, data, serverCb) =>
{
    socket.emit(trigger, data, function responseCallback(...args)
    {
        serverCb(...args);
    });
};

exports.emitPromise = (trigger, data) =>
{
    return new Promise((resolve, reject) =>
    {
        var receivedResponse = false;

        _socketIoObject.emit(trigger, data, function handleResponse(errMessage, returnData)
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



module.exports = SocketWrapper;

function SocketWrapper(socketIoObject)
{
    const _socketIoObject = socketIoObject;

    this.onDisconnect = (fnToCall) => _socketIoObject.on("disconnect", () => fnToCall(this));

    this.emit = (trigger, data) => _socketIoObject.emit(trigger, data);
}