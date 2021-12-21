
const fs = require("fs");
const path = require("path");
const configStore = require("./config_store.js");
const assert = require("./asserter.js");

const BASE_LOG_PATH = `${configStore.dataFolderPath}/logs`;

const LEAN_LEVEL = 0;
const NORMAL_LEVEL = 1;
const VERBOSE_LEVEL = 2;

var currentLogLevel = configStore.defaultLogLevel;
var isLoggingToFile = true;


if (fs.existsSync(BASE_LOG_PATH) === false)
    fs.mkdirSync(BASE_LOG_PATH);


module.exports.getLeanLevel = () => LEAN_LEVEL;
module.exports.getNormalLevel = () => NORMAL_LEVEL;
module.exports.getVerboseLevel = () => VERBOSE_LEVEL;


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
    var logStr = _log(logLevel, header, ...data);
    _logToFile(logStr, "backup.txt");
};

module.exports.general = (logLevel, header, ...data) =>
{
    var logStr = _log(logLevel, header, ...data);
    _logToFile(logStr, "general.txt");
};

module.exports.error = (logLevel, header, ...data) =>
{
    var logStr = _log(logLevel, header, ...data);
    _logToFile(logStr, "error.txt");
};

module.exports.upload = (logLevel, header, ...data) =>
{
    var logStr = _log(logLevel, header, ...data);
    _logToFile(logStr, "upload.txt");
};


function _log(logLevel, header, ...data)
{
    var logStr = `${_getTimestamp()}\t${header}\n`;

    data.forEach((line) =>
    {
        if (assert.isObject(line) === true)
            logStr += "\n" + _indentJSON(line);

        else logStr += `\n\t${line}`;
    });

    logStr += "\n";

    if (logLevel <= currentLogLevel)
        console.log(logStr);

    return logStr;
}

function _logToFile(logStr, filename)
{
    if (isLoggingToFile === false)
        return;

    const date = new Date();
    const logPath = path.resolve(BASE_LOG_PATH, `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-${filename}`);
    fs.createWriteStream(logPath, { flags: "a" }).write(logStr);
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