

const http = require('http');
const https = require('https');
const asserter = require("./asserter.js");

const GET_METHOD = "GET";
const POST_METHOD = "POST";
const PUT_METHOD = "PUT";
const DELETE_METHOD = "DELETE";


module.exports = HttpRequest;

function HttpRequest(fullPath, method, port = 443)
{
    var _data = "";
    var _options;
    var _port = port;


    _validateArguments(fullPath, method, port);


    const _hostname = fullPath.replace(/^(.+)\/.*$/i, "$1");
    const _path = fullPath.replace(/^.+(\/.*)$/i, "$1");
    const _method = method;

    this.send = () =>
    {
        _formatOptions();
        return _requestPromise(http, _options, _data);
    };

    this.setData = (data) =>
    {
        if (data != null)
            _data = JSON.stringify(data);
    };

    function _formatOptions()
    {
        _options = {
            hostname: _hostname,
            port: _port,
            path: _path,
            method: _method
        };

        if (method === POST_METHOD)
        {
            _options.headers = {
                "Accept": "application/json",
                "Content-Type": "application/json",
                "Content-Length": _data.length,
            };
        }
    }
}

function _validateArguments(fullPath, method, port)
{
    if (asserter.isString(fullPath) === false)
        throw new Error(`Expected string for fullPath, got '${fullPath}'`);

    if (_isValidMethod(method) === false)
        throw new Error(`Invalid HTTP method provided: '${method}'`);

    if (asserter.isInteger(port) === false)
        throw new Error(`Expected int for port, got '${port}'`);

    if (port < 0)
        throw new Error(`Expected positive value for port, got '${port}'`);
}

function _requestPromise(httpModule, options, data = null)
{
    return new Promise((resolve, reject) =>
    {
        const req = httpModule.request(options, resolve);
        _writeData(req, data);

        req.on('error', (err) =>
        {
            if (_isProtocolError(err) === true)
                return resolve(_requestPromise(https, options, data));
            
            reject(err);
        });
    });
}

function _isProtocolError(err)
{
    return err.message.toLowerCase().includes("EPROTO 18680");
}

function _writeData(req, data)
{
    if (req.method !== POST_METHOD && req.method !== PUT_METHOD)
        return;

    if (data == null)
        return;

    req.write(data);
    req.end();
}

function _isValidMethod(method)
{
    if (asserter.isString(method) === false)
        return false;

    if (method === POST_METHOD)
        return true;

    if (method === GET_METHOD)
        return true;

    if (method === PUT_METHOD)
        return true;

    if (method === DELETE_METHOD)
        return true;

    return false;
}
