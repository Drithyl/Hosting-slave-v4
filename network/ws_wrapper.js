

const log = require("../logger.js");
const { WebSocket } = require("ws");
const masterCommands = require("./endpoints.js");
const gameStore = require("../stores/hosted_games_store.js");
const reservedPortsStore = require("../stores/reserved_ports_store.js");

var _wsWrapper;
var _shutdownGamesTimeoutId;


exports.connect = () =>
{
    log.general(log.getNormalLevel(), "Attempting to connect to the master server...");
    _wsWrapper = new ClientSocketWrapper(process.env.BOT_SERVER_HOST, +process.env.BOT_SERVER_PORT);
    return Promise.resolve(_createConnection());
};

module.exports.on = (...args) => _wsWrapper.onMessage(...args);
module.exports.emit = (...args) => _wsWrapper.emit(...args);
module.exports.emitPromise = (...args) => _wsWrapper.emitPromise(...args);


function _createConnection()
{
    _wsWrapper.onConnected(_connectedHandler);
    _wsWrapper.onReconnected(_reconnectedHandler);
    _wsWrapper.onClose(_disconnectHandler);
    _wsWrapper.onError((err) => log.general(log.getLeanLevel(), `WebSocket Error`, err));

    masterCommands.listen(module.exports);
}

function _connectedHandler()
{
    log.general(log.getLeanLevel(), `Connected to master server; sending data...`);

    if (_shutdownGamesTimeoutId != null)
    {
        log.general(log.getLeanLevel(), `Stopped disconnection timeout`);
        clearTimeout(_shutdownGamesTimeoutId);
    }

    _wsWrapper.emit("SERVER_DATA", {
        id: process.env.APP_ID, 
        capacity: +process.env.MAX_GAMES, 
        ownerDiscordID: process.env.OWNER_DISCORD_ID
    });
}

function _reconnectedHandler()
{
    
}

function _disconnectHandler(code, reason, wsWrapper)
{
    log.general(log.getLeanLevel(), `Socket disconnected with code ${code} and reason: ${reason}`);

    // Start a timeout of 5 minutes. If after the 5 minutes the socket
    // is still not reconnected, shut down all games and free all ports.
    // If the socket reconnected and disconnected again, 
    // clear the timout and start it up once more
    if (_shutdownGamesTimeoutId != null)
        clearTimeout(_shutdownGamesTimeoutId);

    log.general(log.getLeanLevel(), `Starting timeout to shut down games if no reconnection happens.`);
    _shutdownGamesTimeoutId = setTimeout(() => _shutdownGamesTimeoutHandler(wsWrapper), 300000);
    wsWrapper.reconnect();
}

function _shutdownGamesTimeoutHandler(wsWrapper)
{
    // Clear timeout id when it triggers
    _shutdownGamesTimeoutId = null;

    if (wsWrapper.isConnected() === false)
    {
        log.general(log.getLeanLevel(), `Socket is still disconnected after timeout; shutting down all games...`);

        // release all reserved ports in assisted hosting instances,
        // because if it's the master server that crashed, when it comes back up
        // the ports will be reserved for no instance
        reservedPortsStore.releaseAllPorts();
        gameStore.killAllGames();
    }
}

function ClientSocketWrapper(ip, port)
{
    const _self = this;
    const _ip = ip;
    const _port = port;
    const _awaitingResponse = [];
    const _handlers = [];

    var _ws = new WebSocket(`ws://${_ip}:${_port}`);

    var _id;
    var _pingTimeout;
    var _reconnectTimeout;
    var _onConnectedHandlers = [];
    var _onReconnectedHandlers = [];
    var _onCloseHandlers = [];
    var _onErrorHandlers = [];

    _initialize();

    
    _self.isConnecting = () => _ws != null && _ws.readyState === _ws.CONNECTING;
    _self.isConnected = () => _ws != null && _ws.readyState === _ws.OPEN;
    _self.isClosing = () => _ws != null && _ws.readyState === _ws.CLOSING;
    _self.isClosed = () => _ws != null && _ws.readyState === _ws.CLOSED;
    
    _self.getId = () => _id;
    _self.setId = (id) => _id = id;

    _self.clearPingTimeout = () => clearInterval(_pingTimeout);
    _self.setPingTimeout = (handler, timeout) => {
        _pingTimeout = setTimeout(handler, timeout);
    };

    _self.close = () => _ws?.close();
    _self.terminate = () => _ws?.terminate();
    _self.reconnect = (delay = 5000) =>
    {
        if (_reconnectTimeout != null)
            clearTimeout(_reconnectTimeout);

        _reconnectTimeout = setTimeout(() =>
        {
            _ws = new WebSocket(`ws://${_ip}:${_port}`);
            _initialize();
            _onReconnectedHandlers.forEach((handler) => handler(_self));

        }, delay);
    };

    _self.emit = (trigger, data, error = null, expectsResponse = false) =>
    {
        const wrappedData = {
            trigger: trigger,
            data: data,
            error: (typeof error === "object" && error != null) ? error.message : error,
            expectsResponse: expectsResponse
        };
    
        _ws.send( _stringify(wrappedData) );
    };

    _self.emitPromise = (trigger, data, timeout = 60000) =>
    {
        return new Promise((resolve, reject) =>
        {
            _self.emit(trigger, data, null, true);
            _awaitingResponse.push({
                trigger,
                resolve,
                reject
            });
    
            setTimeout(() =>
            {
                const index = _awaitingResponse.findIndex((p) => p.trigger === trigger);

                    // Promise already got deleted beforehand
                    if (index === -1)
                        return;
        
                    _awaitingResponse[index].reject(new TimeoutError(`Request ${trigger} to socket ${_id} timed out`));
                    _awaitingResponse.splice(index, 1);
    
            }, timeout);
        });
    };

    _self.onMessage = (trigger, handler, respond = false) =>
    {
        if (typeof handler !== "function")
            throw new TypeError(`Expected handler to be a function; received ${typeof handler}`);
    
        _handlers[trigger] = _wrapHandler(handler, trigger, respond);
    };

    _self.onConnected = (handler) => {
        (typeof handler === "function")
            _onConnectedHandlers.push(handler);
    };

    _self.onReconnected = (handler) => {
        (typeof handler === "function")
            _onReconnectedHandlers.push(handler);
    };

    _self.onClose = (handler) => {
        (typeof handler === "function")
            _onCloseHandlers.push(handler);
    };

    _self.onError = (handler) => {
        (typeof handler === "function")
            _onErrorHandlers.push(handler);
    };

    
    function _initialize()
    {
        _ws.on("open", () =>
        {
            _heartbeat(_ws);
            _onConnectedHandlers.forEach((handler) => handler(_self));
        });

        _ws.on("message", (data) => {
            _onMessageHandler(data);
        });

        _ws.on("close", (code, reason) => {
            clearTimeout(_pingTimeout);
            _onCloseHandlers.forEach((handler) => handler(code, reason, _self));
        });

        _ws.on("error", (err) => {
            _onErrorHandlers.forEach((handler) => handler(err, _self));
        });

        _ws.on("ping", function onPing(data) {
            _heartbeat(_ws, data);
        });
    }

    async function _onMessageHandler(message)
    {
        const { trigger, data, error, expectsResponse } = _parse(message);
        const promiseIndex = _awaitingResponse.findIndex((p) => p.trigger === trigger);
        const pendingPromise = _awaitingResponse[promiseIndex];
        const handler = _handlers[trigger];
    
        if (promiseIndex === -1 && handler != null)
            handler(data, expectsResponse);
    
        if (promiseIndex > -1)
        {
            if (error != null)
                pendingPromise.reject(new SocketResponseError(error));
        
            else pendingPromise.resolve(data);

            // Remove promise after resolving/rejecting it
            _awaitingResponse.splice(promiseIndex, 1);
        }
    }

    // Private heartbeat function to check for broken connection
    function _heartbeat()
    {
        clearTimeout(_pingTimeout);

        // Use `WebSocket#terminate()`, which immediately destroys the connection,
        // instead of `WebSocket#close()`, which waits for the close timer.
        // Delay should be equal to the interval at which your server
        // sends out pings plus a conservative assumption of the latency.
        _pingTimeout = setTimeout(function pingTimeout () {
            console.log("SLAVE TIMED OUT; COULD NOT CLEAR TIMEOUT IN TIME!");
            _ws.terminate();

        }, 30000 + 1000);
    }
}


function _wrapHandler(handler, trigger)
{
    return async (data, expectsResponse) =>
    {
        try
        {
            const returnValue = await handler(data);

            if (expectsResponse === true)
                module.exports.emit(trigger, returnValue);
        }
     
        catch(err)
        {
            if (expectsResponse === true)
                module.exports.emit(trigger, null, err);
        }
    }
}


function _parse(data)
{
    var formattedData = {};
    var parsedData;

    if (Buffer.isBuffer(data) === true)
        parsedData = _jsonParseWithBufferRevival(data.toString());

    if (typeof data === "string")
        parsedData = _jsonParseWithBufferRevival(data);

    formattedData.trigger = parsedData.trigger;
    formattedData.data = parsedData.data;
    formattedData.error = parsedData.error;
    formattedData.expectsResponse = parsedData.expectsResponse;

    return formattedData;
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
