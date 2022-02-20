
const log = require("./logger.js");
const { WebSocket } = require("ws");
const assert = require("./asserter.js");
const configStore = require("./config_store.js");
const gameStore = require("./hosted_games_store.js");
const masterCommands = require("./master_commands.js");
const reservedPortsStore = require("./reserved_ports_store.js");
const { TimeoutError, SocketResponseError } = require("./errors.js");

/****************************************
*   SOCKET CONNECTION TO MASTER SERVER  *
****************************************/
const _masterServerAddress = `ws://${configStore.masterIP}:${configStore.masterPort}/`;
var _ws = new WebSocket(_masterServerAddress);
const _sentMessages = [];
const _eventHandlers = {};

var _pingTimeout;
var _reconnectionTimeout;
var _shutdownGamesTimeout;

exports.connect = () =>
{
    log.general(log.getNormalLevel(), "Attempting to connect to the master server...");
    return Promise.resolve(_createConnection());
};

//No function below will be available until the socket connects successfully
exports.on = (trigger, handler) =>
{
    if (assert.isFunction(handler) === false)
        throw new Error(`Handler must be a function; received ${typeof handler} instead!`);

    _eventHandlers[trigger] = (data, expectsResponse) =>
    {
        // Process data with the given handler
        Promise.resolve(handler(data))
        .then((result) =>
        {
            // Response to the received message
            // with resulting data
            if (expectsResponse === true)
                module.exports.emit(trigger, result);
        })
        // Respond with an error if an exception was caught
        .catch((err) => 
        {
            if (expectsResponse === true)
                this.emit(trigger, null, err)
        });
    };
};

exports.emit = (trigger, data, error = null, expectsResponse = false) =>
{
    const wrappedData = {
        trigger,
        data: data,
        expectsResponse,
        error: (assert.isObject(error) === true) ? error.message : error
    };

    _ws.send( _stringify(wrappedData) );
}

exports.emitPromise = (trigger, data, timeout = 60000) =>
{
    return new Promise((resolve, reject) =>
    {
        const wsPromise = new WebSocketPromise(trigger, resolve, reject, timeout);
        module.exports.emit(trigger, data, null, true);
        _sentMessages.push(wsPromise);

        // Cleanup the promise from the array of sent messages
        // once it resolves, rejects or timeouts
        wsPromise.onFinished(() => _sentMessages.findIndex((promise, i) =>
        {
            if (promise.getTrigger() === trigger)
                _sentMessages.splice(i, 1);
        }));
    });
};

function _createConnection()
{
    _ws = new WebSocket(_masterServerAddress);

    _ws.on("open", _connectedHandler);
    _ws.on("ping", () => _heartbeat(_ws));
    _ws.on("close", _disconnectHandler);
    _ws.on("message", _onMessageReceived);
    _ws.on("error", (err) => 
    {
        log.general(log.getLeanLevel(), `WebSocket Error`, err);
    });

    masterCommands.listen(module.exports);
}

function _connectedHandler()
{
    _heartbeat(_ws);
    log.general(log.getNormalLevel(), `Connected to master server successfully.`);

    if (_shutdownGamesTimeout != null)
    {
        log.general(log.getLeanLevel(), `Stopped disconnection timeout`);
        clearTimeout(_shutdownGamesTimeout);
    }
}


/******************************
*   DISCONNECTION HANDLING    *
******************************/
function _disconnectHandler(code, reason)
{
    clearTimeout(_pingTimeout);
    log.general(log.getLeanLevel(), `Socket disconnected with code ${code} and reason: ${reason}`);

    // If code is 0, we forcibly disconnected the ws
    // because pings from master stopped coming, so
    // recreate a new connection now that this is closed
    if (code === 0)
        return _reconnectHandler();


    // Start a timeout of 5 minutes. If after the 5 minutes the socket
    // is still not reconnected, shut down all games and free all ports.
    // If the socket reconnected and disconnected again, 
    // clear the timout and start it up once more
    if (_shutdownGamesTimeout != null)
        clearTimeout(_shutdownGamesTimeout);

    _reconnectHandler();

    log.general(log.getLeanLevel(), `Starting timeout to shut down games if no reconnection happens.`);
    _shutdownGamesTimeout = setTimeout(() => 
    {
        _shutdownGamesTimeout = null;

        // 1 is OPEN
        if (_ws.readyState === 1)
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

function _reconnectHandler()
{
    if (_reconnectionTimeout != null)
        return;

    _reconnectionTimeout = setTimeout(() =>
    {
        log.general(log.getNormalLevel(), `Attempting to reconnect...`);
        _reconnectionTimeout = null;
        _createConnection();

    }, 10000);
}


// Handle incoming messages on this socket distributing them
// among listening handlers or treating them as responses
// from previously sent messages by this socket
function _onMessageReceived(data)
{
    const parsedData = _parse(data);
    const trigger = parsedData.trigger;
    const pendingPromise = _sentMessages.find((wsPromise) => trigger === wsPromise.getTrigger());
    const handler = _eventHandlers[trigger];

    // If we were pending a response, handle it directly in the WebSocketPromise object
    if (assert.isInstanceOfPrototype(pendingPromise, WebSocketPromise) === true)
        pendingPromise.handleResponse(parsedData);

    // Otherwise this is a direct message, so handle its data with the registered handler
    else if (assert.isFunction(handler) === true)
        handler(parsedData.data, parsedData.expectsResponse);

    else log.error(log.getLeanLevel(), `Received message with unregistered trigger ${trigger}`);
}

// Following recommended implentation:
// https://github.com/websockets/ws#how-to-detect-and-close-broken-connections
function _heartbeat(ws)
{
    log.timeEnd("heartbeat");
    //console.timeEnd("heartbeat");
    clearTimeout(_pingTimeout);

    // Use `WebSocket#terminate()`, which immediately destroys the connection,
    // instead of `WebSocket#close()`, which waits for the close timer.
    // Delay should be equal to the interval at which your server
    // sends out pings plus a conservative assumption of the latency.
    _pingTimeout = setTimeout(() => {
        log.error(log.getLeanLevel(), `Connection to master timed out`);
        ws.terminate();
    }, 30000 + 1000);
    
    //console.time("heartbeat");
    log.time("heartbeat", `Master ping received, time since last`);
}


function WebSocketPromise(trigger, resolveFn, rejectFn, timeout)
{
    const _trigger = trigger;
    const _resolveFn = resolveFn;
    const _rejectFn = rejectFn;
    const _timeout = timeout ?? 60000;

    var _receivedResponse = false;
    var _cleanupHandler;

    this.getTrigger = () => _trigger;

    this.onFinished = (cleanupFn) => _cleanupHandler = cleanupFn;

    this.handleResponse = (data) =>
    {
        if (_receivedResponse === true)
            return;

        if (data == null)
            _settle(_rejectFn.bind(this, new SocketResponseError(`No data packet for this response was received!`)));

        else if (data.error != null)
            _settle(_rejectFn.bind(this, new SocketResponseError(data.error)));

        else _settle(_resolveFn.bind(this, data.data));
    };

    // If a timeout was given, start it as the creation of this object
    if (assert.isInteger(_timeout) === true && _timeout > 0)
    {
        setTimeout(function handleTimeout()
        {
            if (_receivedResponse === true)
                return;

            _receivedResponse = true;
            _settle(_rejectFn.bind(this, new TimeoutError(`Request timed out.`)));

            if (assert.isFunction(_cleanupHandler) === true)
                _cleanupHandler();

        }, _timeout);
    }

    function _settle(handlerFn)
    {
        if (_receivedResponse === true)
            return;

        _receivedResponse = true;
        handlerFn();

        if (assert.isFunction(_cleanupHandler) === true)
            _cleanupHandler();
    }
}

function _parse(data)
{
    var parsedData;

    if (Buffer.isBuffer(data) === true)
        parsedData = _jsonParseWithBufferRevival(data.toString());

    if (assert.isString(data) === true)
        parsedData = _jsonParseWithBufferRevival(data);

    return parsedData;
}

// Parse JSON while also checking if there is any nested serialized
// Buffer value. These appear as objects with a .type === "Buffer" and
// .data property that contains the actual buffer. If found, return the
// .data property properly converted to a Buffer object
function _jsonParseWithBufferRevival(data)
{
    return JSON.parse(data, (key, value) =>
    {
        if (_isSerializedBuffer(value) === true)
            return Buffer.from(value.data);

        return value;
    });
}

// Checks if an object is in fact a serialized Buffer. These appear as 
// objects with a .type === "Buffer" and .data property that contains the actual buffer.
function _isSerializedBuffer(value)
{
  return value != null && 
    typeof value === "object" &&
    value.type === "Buffer" && 
    Array.isArray(value.data) === true;
}

// Stringify that prevents circular references taken from https://antony.fyi/pretty-printing-javascript-objects-as-json/
function _stringify(data, spacing = 0)
{
	var cache = [];

	// custom replacer function gets around the circular reference errors by discarding them
	var str = JSON.stringify(data, function(key, value)
	{
		if (typeof value === "object" && value != null)
		{
			// value already found before, discard it
			if (cache.indexOf(value) !== -1)
			    return;

			// not found before, store this value for reference
			cache.push(value);
		}

		return value;

	}, spacing);

	// enable garbage collection
	cache = null;
	return str;
}

function _byteCount(s) {
    return encodeURI(s).split(/%..|./).length - 1;
}