
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const HttpRequest = require("../network/http_request.js");
const backupScript = require("../scripts/backup_script.js");
const statusDump = require("../dominions/status_dump_wrapper.js");
const { getDominionsSavedgamesPath, getGamePreTurnBackupPath, getGamePostTurnBackupPath, getGameLogPath, getStatusdumpClonePath, safePath } = require("../utilities/path-utilities.js");

var logFilename;
var writeStream;
var logDirpath;
let clonedStatusdumpPath;

module.exports.preprocessing = async (gameName, gameType) =>
{
    try
    {
        _initializeGlobals(gameName, gameType);
        _logToFile(`###############################################`);
        _logToFile(`${gameName} (${gameType}) - Beginning PREprocessing of new turn`);

        // Remove domcmd file that may be leftover to avoid double turns
        await _removeLeftoverDomCmdFile(gameName, gameType);

        // Clone the game's statusdump, so that we can capture its information
        // even after the turn has rolled and altered its contents
        await _cloneStatusdump(gameName, gameType);

        // Notify master that turn started processing
        await _notifyMaster(gameName, 'preexec-start');

        // Parse the current statusdump file for the game
        const statusdumpWrapper = await _fetchStatusdump(gameName, gameType, false);
        const backupPath = getGamePreTurnBackupPath(gameName);

        // Run the preprocessing backup
        await backupScript.backupTurn(statusdumpWrapper, backupPath);

        // Notify master that pre-backup finished
        await _notifyMaster(gameName, 'preexec-finish', { turnNumber: statusdumpWrapper.turnNbr });
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

        // Remove domcmd file that may be leftover to avoid double turns
        await _removeLeftoverDomCmdFile(gameName, gameType);

        // Notify master that turn finished processing
        await _notifyMaster(gameName, 'postexec-start');

        // Parse the current statusdump file for the game
        const statusdumpWrapper = await _fetchStatusdump(gameName, gameType, true);
        const backupPath = getGamePostTurnBackupPath(gameName);

        // Run the postprocessing backup
        await backupScript.backupTurn(statusdumpWrapper, backupPath);

        // Notify master that post-backup finished, and send the statusdump data
        await _notifyMaster(gameName, 'postexec-finish', { statusdump: statusdumpWrapper.toJSON() });
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


async function _cloneStatusdump(gameName, gameType)
{
    _logToFile(`Cloning statusdump...`);

    if (fs.existsSync(clonedStatusdumpPath) === false)
    {
        _logToFile(`Statusdump clone path ${clonedStatusdumpPath} does not exist; creating it...`);
        await fsp.mkdir(clonedStatusdumpPath, { recursive: true });
    }

    statusDump.cloneStatusDump(gameName, gameType, clonedStatusdumpPath);
}

async function _fetchStatusdump(gameName, gameType, isPostprocessing)
{
    _logToFile(`Fetching statusdump...`);

    if (isPostprocessing === true)
    {
        statusdumpWrapper = await statusDump.fetchStatusDump(gameName, gameType, clonedStatusdumpPath);

        if (statusdumpWrapper.turnNbr == null) {
            throw new Error(`Expected integer in postprocessing statusdump's turnNbr; instead got ${statusdumpWrapper.turnNbr}`);
        }

        // Manually increment turn number for the post-turn backup,
        // as the turn number we have is the one from the previous turn
        statusdumpWrapper.turnNbr++;
        _logToFile(`Postprocessing; increment turn number`);
    }
    
    else 
    {
        statusdumpWrapper = await statusDump.fetchStatusDump(gameName, gameType);
    }

    _logToFile(`Statusdump fetched, turn is ${statusdumpWrapper.turnNbr}`);
    return statusdumpWrapper;
}

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

function _initializeGlobals(gameName, gameType)
{
    const date = new Date();
    logDirpath = getGameLogPath(gameName);

    // Create game logging path if it does not exist
    if (fs.existsSync(logDirpath) === false) {
        fs.mkdirSync(logDirpath);
    }

    clonedStatusdumpPath = getStatusdumpClonePath(gameName, gameType);
    logFilename = `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-turn.txt`;
    writeStream = fs.createWriteStream(path.resolve(logDirpath, logFilename), { flags: "a", autoClose: true });
}

async function _notifyMaster(gameName, status, data = {})
{
    try
    {
        const route = `${process.env.BOT_SERVER_HOST}/turn_processing`;

        _logToFile(`${gameName} - Creating HTTP request to notify master of turn processing = ${status}...`);
        const httpRequest = new HttpRequest(route, "POST", +process.env.BOT_SERVER_HTTP_PORT);

        const httpData = {
            gameName,
            serverToken: process.env.APP_ID,
            status,
            turnNumber: data.turnNumber,
            statusdump: data.statusdump
        };

        if (data.error)
            httpData.error = data.error.message;

        // Set HTTP data
        httpRequest.setData(httpData);
        _logToFile(`${gameName} - Route: ${route} at port ${+process.env.BOT_SERVER_HTTP_PORT}. Sending HTTP request`);

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
