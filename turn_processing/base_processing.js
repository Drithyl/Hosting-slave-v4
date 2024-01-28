
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const safePath = require("../safe_path.js");
const configStore = require("../config_store.js").loadConfig();
const HttpRequest = require("../http_request.js");
const backupScript = require("../backup_script.js");
const { getDominionsSavedgamesPath } = require("../helper_functions.js");

var logDirpath;
var logFilename;
var writeStream;

module.exports.preprocessing = async (gameName, gameType) =>
{
    try
    {
        _initializeGlobals(gameName, gameType);
        _logToFile(`###############################################`);
        _logToFile(`${gameName} (${gameType}) - Beginning PREprocessing of new turn`);

        // Remove domcmd file that may be leftover to avoid double turns
        await _removeLeftoverDomCmdFile(gameName, gameType);

        // Notify master that turn started processing
        await _notifyMaster(gameName, 'preexec-start');

        // Run the preprocessing backup
        const statusdumpWrapper = await backupScript.backupPreTurn(gameName, gameType);
        const turnNumber = statusdumpWrapper.turnNbr;
        const nationStatusArray = statusdumpWrapper.nationStatusArray;

        // Notify master that pre-backup finished
        await _notifyMaster(gameName, 'preexec-finish', { turnNumber });
    }

    catch(error)
    {
        _logToFile(`${gameName} - Preprocessing uncaught error: ${error.message}`);

        // Notify master that an error occurred
        await _notifyMaster(gameName, 'preexec-error', { error });
    }

    finally
    {
        process.exit();
    }
};

module.exports.postprocessing = async (gameName, gameType) =>
{
    try
    {
        _initializeGlobals(gameName, gameType);
        _logToFile(`###############################################`);
        _logToFile(`${gameName} (${gameType}) - Beginning POSTprocessing of new turn`);

        // Notify master that turn finished processing
        await _notifyMaster(gameName, 'postexec-start');

        // Run the postprocessing backup
        const statusdumpWrapper = await backupScript.backupPostTurn(gameName, gameType);
        const turnNumber = statusdumpWrapper.turnNbr;
        const nationStatusArray = statusdumpWrapper.nationStatusArray;

        // Notify master that pre-backup finished
        await _notifyMaster(gameName, 'postexec-finish', { turnNumber });
    }

    catch(error)
    {
        _logToFile(`${gameName} (${gameType}) - Postprocessing uncaught error: ${error.message}`);

        // Notify master that an error occurred
        await _notifyMaster(gameName, 'postexec-error', { error });
    }

    finally
    {
        process.exit();
    }
};


async function _removeLeftoverDomCmdFile(gameName, gameType)
{
    const savedgamesPath = safePath(getDominionsSavedgamesPath(gameType), gameName);
    const domcmdPath = safePath(savedgamesPath, "domcmd");

    if (fs.existsSync(domcmdPath) === false)
        return _logToFile(`${gameName} (${gameType}) - No leftover domcmd file to delete before turn processing`);

    try
    {
        await fsp.unlink(domcmdPath);
        _logToFile(`${gameName} (${gameType}) - Successfully deleted leftover domcmd file before turn processing`);
    }

    catch(err)
    {
        _logToFile(`Found a leftover domcmd file at ${domcmdPath}, but could not remove it: ${err.message}`);
    }
}

function _initializeGlobals(gameName)
{
    const date = new Date();

    logDirpath = safePath(configStore.dataFolderPath, "logs", "games", gameName);
    logFilename = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-turn.txt`;
    writeStream = fs.createWriteStream(path.resolve(logDirpath, logFilename), { flags: "a", autoClose: true });
}

async function _notifyMaster(gameName, status, data = {})
{
    try
    {
        const route = `${configStore.masterIP}/turn_processing`;

        _logToFile(`${gameName} - Creating HTTP request to notify master of turn processing = ${status}...`);
        const httpRequest = new HttpRequest(route, "POST", configStore.masterHttpPort);

        const httpData = {
            gameName,
            serverToken: configStore.id,
            status,
            turnNumber: data.turnNumber
        };

        if (data.error)
            httpData.error = data.error.message;

        // Set HTTP data
        httpRequest.setData(httpData);
        _logToFile(`${gameName} - Route: ${route} at port ${configStore.masterHttpPort}. Sending HTTP request`);

        // Send and wait for a response
        const res = await httpRequest.send();
        _logToFile(`${gameName} - HTTP request sent. Response code is ${res.statusCode}`);

        // Listen for a response
        res.on("data", data => _logToFile(`${gameName} - Response data received: `, data.toString()));
    }

    catch(err)
    {
        _logToFile(`${gameName} - Error notifying master of turn processing: ${err.message}`);
    }
}

function _logToFile(str)
{
    const timestamp = new Date(Date.now()).toISOString().replace(/^(.+)(T)/i, "$1$2 ");
    writeStream.write(`${timestamp}\t${str}\n`);
}
