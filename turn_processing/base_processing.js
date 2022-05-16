
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const safePath = require("../safe_path.js");
const configStore = require("../config_store.js").loadConfig();
const HttpRequest = require("../http_request.js");
const backupScript = require("../backup_script.js");

var logDirpath;
var logFilename;
var writeStream;



module.exports.preprocessing = async (gameName) =>
{
    try
    {
        _initializeGlobals(gameName);
        _logToFile(`###############################################`);
        _logToFile(`${gameName} - Beginning PREprocessing of new turn`);
        await _turnProcessing(gameName, true);
    }

    catch(err)
    {
        _logToFile(`${gameName} - Preprocessing uncaught error: ${err.message}`);
    }

    finally
    {
        process.exit();
    }
};

module.exports.postprocessing = async (gameName) =>
{
    try
    {
        _initializeGlobals(gameName);
        _logToFile(`###############################################`);
        _logToFile(`${gameName} - Beginning POSTprocessing of new turn`);
        await _turnProcessing(gameName, false);
    }

    catch(err)
    {
        _logToFile(`${gameName} - Postprocessing uncaught error: ${err.message}`);
    }

    finally
    {
        process.exit();
    }
};


async function _removeLeftoverDomCmdFile(gameName)
{
    const savedgamesPath = safePath(configStore.dom5DataPath, "savedgames", gameName);
    const domcmdPath = safePath(savedgamesPath, "domcmd");

    if (fs.existsSync(domcmdPath) === false)
        return _logToFile(`${gameName} - No leftover domcmd file to delete before turn processing`);

    try
    {
        await fsp.unlink(domcmdPath);
        _logToFile(`${gameName} - Successfully deleted leftover domcmd file before turn processing`);
    }

    catch(err)
    {
        _logToFile(`Found a leftover domcmd file at ${domcmdPath}, but could not remove it: ${err.message}`);
    }
}

async function _turnProcessing(gameName, isTurnProcessing)
{
    if (isTurnProcessing === true)
        await _removeLeftoverDomCmdFile(gameName);

    // Notify master that turn started processing
    await _notifyMasterOfTurnProcessing(gameName, isTurnProcessing);

    // Run the preprocessing backup
    await backupScript.backupPreTurn(gameName);
}

function _initializeGlobals(gameName)
{
    const date = new Date();

    logDirpath = safePath(configStore.dataFolderPath, "logs", "games", gameName);
    logFilename = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-turn.txt`;
    writeStream = fs.createWriteStream(path.resolve(logDirpath, logFilename), { flags: "a", autoClose: true });
}

async function _notifyMasterOfTurnProcessing(gameName, isTurnProcessing)
{
    try
    {
        const route = `${configStore.masterIP}/turn_processing`;
        _logToFile(`${gameName} - Creating HTTP request to notify master of turn processing = ${isTurnProcessing}...`);
        const httpRequest = new HttpRequest(route, "POST", configStore.masterHttpPort);
        _logToFile(`${gameName} - Route: ${route} at port ${configStore.masterHttpPort}`);

        httpRequest.setData({
            gameName,
            serverToken: configStore.id,
            isTurnProcessing
        });

        _logToFile(`${gameName} - Sending HTTP request`);

        const res = await httpRequest.send();
        _logToFile(`${gameName} - HTTP request sent. Response code is ${res.statusCode}`);
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
