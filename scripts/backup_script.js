

const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const cleaner = require("../cleaners/backups_cleaner.js");
const statusDump = require("../dominions/status_dump_wrapper.js");
const { getDominionsSavedgamesPath, getStatusdumpClonePath, safePath } = require("../utilities/path-utilities.js");
const { DOM5_GAME_TYPE_NAME, DOM6_GAME_TYPE_NAME, GAME_LOGS_DIR_PATH, BACKUPS_DIR_PATH } = require("../constants.js");


var backupExtensions;
var savedgamesPath;
var clonedStatusdumpDirpath;
var logDirpath;
var targetBackupDirpath;
var writeStream;


module.exports.backupTurn = async (statusdumpWrapper, backupPath) =>
{
    const gameName = statusdumpWrapper.getName();
    const gameType = statusdumpWrapper.getType();

    _initializeGlobals(gameName, gameType);
    targetBackupDirpath = backupPath;

    try
    {
        await _createLoggingStream();

        _checkBackupArgs(gameName, gameType);
    
        await _cloneStatusdump(gameName, gameType);
    
        _logToFile(`Backup for ${gameName} starting; checking arguments...`);
    
        await _startBackupProcess(statusdumpWrapper);

        _logToFile(`Finished backup process! Exiting...`);
    }

    catch(err)
    {
        if (writeStream != null)
            _logToFile(err.stack);
    }
};



function _initializeGlobals(gameName, gameType)
{
    savedgamesPath = path.resolve(getDominionsSavedgamesPath(gameType), gameName);
    backupExtensions = new RegExp("(\.2h)|(\.trn)|(ftherlnd)$", "i");
    clonedStatusdumpDirpath = getStatusdumpClonePath(gameName, gameType);
    logDirpath = safePath(GAME_LOGS_DIR_PATH, gameName);
    targetBackupDirpath = safePath(BACKUPS_DIR_PATH, gameName);
}

async function _createLoggingStream()
{
    const date = new Date();
    logFilename = path.resolve(logDirpath, `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-turn.txt`);

    if (fs.existsSync(logDirpath) === false)
        await fsp.mkdir(logDirpath, { recursive: true });

    writeStream = fs.createWriteStream(logFilename, { flags: "a", autoClose: true });
}

function _checkBackupArgs(gameName, gameType)
{
    _logToFile(`Checking process arguments for backup...`);

    if (gameName == null)
        throw new Error(`BACKUP ERROR; NO GAME NAME ARGUMENT RECEIVED`);

    if (gameType !== DOM5_GAME_TYPE_NAME && gameType !== DOM6_GAME_TYPE_NAME)
        throw new Error(`BACKUP ERROR; GAME TYPE ARGUMENT RECEIVED INCORRECT: ${gameType}`);
    
    _logToFile(`Arguments received properly.`);
}

async function _startBackupProcess(statusdumpWrapper)
{
    var backupFilenames;
    const backupDirName = `t${statusdumpWrapper.turnNbr}`;
    const backupDirPath = path.resolve(targetBackupDirpath, backupDirName);
    
    await _createDirectories(backupDirPath);

    _logToFile(`Backup directory created at "${backupDirPath}"`);
    backupFilenames = await fsp.readdir(savedgamesPath);

    _logToFile(`Read filenames, backing up files...`);
    await _backupFiles(backupFilenames, savedgamesPath, backupDirPath)

    _logToFile(`Finished backing up turn files, cleaning old ones...`);
    await _cleanUnusedBackups(statusdumpWrapper);
}


async function _cloneStatusdump(gameName, gameType)
{
    _logToFile(`Cloning statusdump...`);

    if (fs.existsSync(clonedStatusdumpDirpath) === false)
    {
        _logToFile(`Statusdump clone path ${clonedStatusdumpDirpath} does not exist; creating it...`);
        await fsp.mkdir(clonedStatusdumpDirpath, { recursive: true });
    }

    statusDump.cloneStatusDump(gameName, gameType, clonedStatusdumpDirpath);
}

async function _createDirectories(targetBackupDirpath)
{
    var directories = [];
    var currentPath = path.dirname(targetBackupDirpath);

    while (currentPath !== path.dirname(currentPath))
    {
        directories.unshift(currentPath);
        currentPath = path.dirname(currentPath);
    }

    const promises = directories.map(async (dir) =>
    {
        if (fs.existsSync(dir) === false)
            await fsp.mkdir(dir);
    });

    await Promise.allSettled(promises);
}

async function _backupFiles(filenames, sourcePath, targetPath)
{
    const promises = filenames.map(async (filename) =>
    {
        _logToFile(`Checking ${filename}...`);
        
        if (backupExtensions.test(filename) === false)
            return _logToFile(`Not a turn file; skipping.`);

        _logToFile(`Turn file found, backing up...`);

        await fsp.copyFile(path.resolve(sourcePath, filename), path.resolve(targetPath, filename));
        _logToFile(`Turn file backed up.`);
    });

    await Promise.allSettled(promises);
}

async function _cleanUnusedBackups(statusDump)
{
    const maxNumberOfBackups = +process.env.MAX_TURN_BACKUPS_PER_GAME;

    // If turn number is lower than number of backups to keep, no need to clean
    if (statusDump.turnNbr <= maxNumberOfBackups)
        return _logToFile(`No old turn backups to clean.`);

    // Otherwise, delete previous backups according to the configuration
    const turnNbrToClean = statusDump.turnNbr - maxNumberOfBackups;

    await cleaner.deleteBackupsUpToTurn(targetBackupDirpath, turnNbrToClean);
}


function _logToFile(str)
{
    const timestamp = new Date(Date.now()).toISOString().replace(/^(.+)(T)/i, "$1$2 ");
    writeStream.write(`${timestamp}\t${str}\n`);
}