
const fs = require("fs");
const path = require("path");
const stream = require("stream");
const assert = require("./utilities/type-utilities.js");
const { LOGS_DIR_PATH } = require("./constants.js");

const LEAN_LEVEL = 0;
const NORMAL_LEVEL = 1;
const VERBOSE_LEVEL = 2;
const WRITE_ONLY_LEVEL = 99;

var currentLogLevel = process.env.LOG_LEVEL;
var isLoggingToConsole = process.env.LOG_TO_CONSOLE ?? true;
var isLoggingToFile = true;

var dayOfMonth = new Date().getDate();
var backupWriteStream;
var cleanerWriteStream;
var generalWriteStream;
var errorWriteStream;
var uploadWriteStream;


if (fs.existsSync(LOGS_DIR_PATH) === false)
    fs.mkdirSync(LOGS_DIR_PATH);

_updateStreamPaths();

module.exports.getLeanLevel = () => LEAN_LEVEL;
module.exports.getNormalLevel = () => NORMAL_LEVEL;
module.exports.getVerboseLevel = () => VERBOSE_LEVEL;
module.exports.getWriteOnlyLevel = () => WRITE_ONLY_LEVEL;


module.exports.setLogLevel = (level) =>
{
    if (assert.isInteger(level) === false)
        return;

    logLevel = level;
    exports.general(LEAN_LEVEL, `logLevel set to ${level}.`);
};

module.exports.isLoggingToFile = () => isLoggingToFile;
module.exports.setLogToFile = (shouldLogToFile) =>
{
    if (assert.isBoolean(shouldLogToFile) === false)
        return;

    isLoggingToFile = shouldLogToFile;
    exports.general(LEAN_LEVEL, `isLoggingToFile set to ${shouldLogToFile}.`);
};

// Used by the backup_script.js, does not need to print to console
// as it's a separate console window. If it does, it will be picked
// by the stdio pipes and emitted to the master server
module.exports.backup = (logLevel, header, ...data) =>
{
    var logStr = _formatEntry(header, ...data);
    _log(logLevel, logStr);
    _logToFile(logStr, backupWriteStream);
};

module.exports.cleaner = (logLevel, header, ...data) =>
{
    var logStr = _formatEntry(header, ...data);
    _log(logLevel, logStr);
    _logToFile(logStr, cleanerWriteStream);
};

module.exports.general = (logLevel, header, ...data) =>
{
    var logStr = _formatEntry(header, ...data);
    _log(logLevel, logStr);
    _logToFile(logStr, generalWriteStream);
};

module.exports.error = (logLevel, header, ...data) =>
{
    var logStr = _formatEntry(header, ...data);
    _log(logLevel, logStr);
    _logToFile(logStr, errorWriteStream);
};

module.exports.upload = (logLevel, header, ...data) =>
{
    var logStr = _formatEntry(header, ...data);
    _log(logLevel, logStr);
    _logToFile(logStr, uploadWriteStream);
};

module.exports.toFile = (filePath, header, ...data) =>
{
    var logStr = _formatEntry(header, ...data);
    var writeStream = fs.createWriteStream(filePath, { flags: "a", autoClose: true });
    _logToFile(logStr, writeStream);
    writeStream.end();
};

const timers = {};

module.exports.time = (tag, display) =>
{
    timers[tag] = {
        start: Date.now(),
        display: display ?? tag
    };
};

module.exports.timeEnd = (tag, logLevel) =>
{
    logLevel = logLevel ?? NORMAL_LEVEL;
    const data = timers[tag];
    delete timers[tag];

    if (data == null)
        return;

    const timeTaken = (Date.now() - data.start) * 0.001;
    module.exports.general(logLevel, `${data.display}: ${timeTaken.toFixed(3)}s`);
};

function _formatEntry(header, ...data)
{
    var logStr = `${_getTimestamp()}\t${header}\n`;

    data.forEach((line) =>
    {
        if (assert.isObject(line) === true)
            logStr += "\n" + _indentJSON(line);

        else logStr += `\n\t${line}`;
    });

    logStr += "\n";
    return logStr;
}

function _log(logLevel, logStr)
{
    if (logLevel <= currentLogLevel && isLoggingToConsole === true)
        console.log(logStr);
}

function _logToFile(logStr, writeStream)
{
    if (isLoggingToFile === false)
        return;

    _updateStreamPaths();
    writeStream.write(logStr);
}

function _updateStreamPaths()
{
    const date = new Date();
    const day = date.getDate();

    if (dayOfMonth === day && 
        assert.isInstanceOfPrototype(backupWriteStream, stream.Writable) === true && 
        assert.isInstanceOfPrototype(cleanerWriteStream, stream.Writable) === true && 
        assert.isInstanceOfPrototype(generalWriteStream, stream.Writable) === true && 
        assert.isInstanceOfPrototype(errorWriteStream, stream.Writable) === true && 
        assert.isInstanceOfPrototype(uploadWriteStream, stream.Writable) === true)
        return;

    dayOfMonth = day;

    if (backupWriteStream != null && backupWriteStream.destroyed === false)
        backupWriteStream.destroy();

    if (cleanerWriteStream != null && cleanerWriteStream.destroyed === false)
        cleanerWriteStream.destroy();

    if (generalWriteStream != null && generalWriteStream.destroyed === false)
        generalWriteStream.destroy();

    if (errorWriteStream != null && errorWriteStream.destroyed === false)
        errorWriteStream.destroy();

    if (uploadWriteStream != null && uploadWriteStream.destroyed === false)
        uploadWriteStream.destroy();

    backupWriteStream = fs.createWriteStream(_getLogPath(date, "backup.txt"), { flags: "a", autoClose: true });
    cleanerWriteStream = fs.createWriteStream(_getLogPath(date, "backup.txt"), { flags: "a", autoClose: true });
    generalWriteStream = fs.createWriteStream(_getLogPath(date, "general.txt"), { flags: "a", autoClose: true });
    errorWriteStream = fs.createWriteStream(_getLogPath(date, "error.txt"), { flags: "a", autoClose: true });
    uploadWriteStream = fs.createWriteStream(_getLogPath(date, "upload.txt"), { flags: "a", autoClose: true });
}

function _getLogPath(date, filename)
{
    return path.resolve(LOGS_DIR_PATH, `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-${filename}`);
}

function _getTimestamp()
{
    return new Date(Date.now()).toISOString().replace(/^(.+)(T)/i, "$1$2 ");
}

// Stringify a json object with full indentation
function _indentJSON(obj)
{
    // Replace the normal stringification if the object is an Error,
    // otherwise they will show as empty {} objects
    const jsonStr = JSON.stringify(obj, function replacer(objKey, objValue)
    {
        const err = {};

        if (objValue instanceof Error)
        {
            Object.getOwnPropertyNames(objValue).forEach((key) => err[key] = objValue[key]);
            return err;
        }

        return objValue;

    }, 4);

    // Split the resulting JSON string by newlines and/or escaped newlines
    const split = jsonStr.split(/\n|\\n/g);

    // Rejoin them with added indentation
    return "\t" + split.join("\n\t") + "\n";
}