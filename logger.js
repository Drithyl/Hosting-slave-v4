
const fs = require("fs");
const configStore = require("./config_store.js");
const assert = require("./asserter.js");
const rw = require("./reader_writer.js");


const logsBasePath = `${configStore.dataFolderPath}/logs`;

const BACKUP_LOG_PATH = `${logsBasePath}/backup.txt`
const GENERAL_LOG_PATH = `${logsBasePath}/general.txt`;
const ERROR_LOG_PATH = `${logsBasePath}/error.txt`;
const UPLOAD_LOG_PATH = `${logsBasePath}/upload.txt`;

const LEAN_LEVEL = 0;
const NORMAL_LEVEL = 1;
const VERBOSE_LEVEL = 2;

var currentLogLevel = configStore.defaultLogLevel;
var logToFile = true;


if (fs.existsSync(logsBasePath) === false)
    fs.mkdirSync(logsBasePath);


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

module.exports.isLoggingToFile = () => logToFile;
module.exports.setLogToFile = (shouldLogToFile) =>
{
    if (assert.isBoolean(shouldLogToFile) === false)
        return;

    logToFile = shouldLogToFile;
    exports.general(LEAN_LEVEL, `logToFile set to ${shouldLogToFile}.`);
};

// Used by the backup_script.js, does not need to print to console
// as it's a separate console window. If it does, it will be picked
// by the stdio pipes and emitted to the master server
module.exports.backup = (logLevel, header, ...data) =>
{
    if (logLevel > currentLogLevel)
        return;

    const logData = _formatLogData(header, ...data);
    _writeToFile(BACKUP_LOG_PATH, logData);
};

module.exports.general = (logLevel, header, ...data) =>
{
    if (logLevel > currentLogLevel)
        return;

    const logData = _formatLogData(header, ...data);
    console.log(logData);
    _writeToFile(GENERAL_LOG_PATH, logData);
};

module.exports.error = (logLevel, header, ...data) =>
{
    if (logLevel > currentLogLevel)
        return;

    const logData = _formatLogData(header, ...data);
    console.log(logData);
    _writeToFile(ERROR_LOG_PATH, logData);
};

module.exports.upload = (logLevel, header, ...data) =>
{
    if (logLevel > currentLogLevel)
        return;

    const logData = _formatLogData(header, ...data);
    console.log(logData);
    _writeToFile(UPLOAD_LOG_PATH, logData);
};


function _formatLogData(header, ...data)
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

function _writeToFile(path, logData)
{
    return rw.append(path, logData)
    .catch((err) => console.log(_formatLogData(`LOGGER ERROR: Could not log to file.`, `${err.message}\n\n${err.stack}`)));
}

function _getTimestamp()
{
    return new Date(Date.now()).toISOString().replace(/^.+T/i, "");
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