
// Disable all console logging during backup, as it will otherwise be passed
// to the parent node process as if it was stdout data from dom5
process.env.LOG_TO_CONSOLE = false;

const configStore = require("./config_store.js").loadConfig();

const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const rw = require("./reader_writer.js");
const safePath = require("./safe_path.js");
const cleaner = require("./cleaners/backups_cleaner.js");
const statusDump = require("./dom5/status_dump_wrapper.js");


const preexecRegex = new RegExp("^preexec$", "i");
const postexecRegex = new RegExp("^postexec$", "i");
const extensionsToBackupRegex = new RegExp("(\.2h)|(\.trn)|(ftherlnd)$", "i");


const gameName = process.argv[2];
const type = process.argv[3];
const savedgamesPath = safePath(configStore.dom5DataPath, "savedgames", gameName);
const clonedStatusdumpDir = safePath(configStore.dom5DataPath, configStore.tmpFilesDirName, gameName);
const logDirPath = safePath(configStore.dataFolderPath, "logs", "games", gameName);

var targetBackupDir = safePath(configStore.dataFolderPath, "backups", gameName);
var writeStream;

_createLoggingStream()
.then(_checkBackupArgs)
.then(_startBackupProcess)
.catch((err) =>
{
    if (writeStream != null)
        _logToFile(err.stack);

    process.exit();
});


async function _createLoggingStream()
{
    const date = new Date();

    await rw.checkAndCreateDirPath(logDirPath);
    writeStream = fs.createWriteStream(path.resolve(logDirPath, `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-backup.txt`), { flags: "a", autoClose: true });
}


function _checkBackupArgs()
{
    _logToFile(`###############################################`);
    _logToFile(`Checking process arguments for backup...`);

    if (gameName == null)
        throw new Error(`BACKUP ERROR; NO GAME NAME ARGUMENT RECEIVED`);
    
    if (preexecRegex.test(type) === true)
        targetBackupDir = path.resolve(targetBackupDir, configStore.preHostTurnBackupDirName);
    
    else if (postexecRegex.test(type) === true)
        targetBackupDir = path.resolve(targetBackupDir, configStore.newTurnsBackupDirName);
    
    else throw new Error(`INVALID BACKUP TYPE RECEIVED; EXPECTED preexec OR postexec, GOT '${type}'`);
    
    _logToFile(`Arguments received properly.`);
}


async function _startBackupProcess()
{
    var statusdumpWrapper;
    var backupFilenames;

    _logToFile(`Backup type ${type} for ${gameName} starting; checking arguments...`);

    if (preexecRegex.test(type) === true)
    {
        _logToFile(`Cloning statusdump...`);
        await _cloneStatusdump(gameName);
    }

    _logToFile(`Fetching statusdump...`);
    statusdumpWrapper = await statusDump.fetchStatusDump(gameName, clonedStatusdumpDir);

    if (postexecRegex.test(type) === true)
    {
        // Manually increment turn number for the post-turn backup,
        // as the turn number we have is the one from the previous turn
        statusdumpWrapper.turnNbr++;
        _logToFile(`This is post-exec, incremented turn nbr`);
    }

    _logToFile(`Statusdump fetched, turn is ${statusdumpWrapper.turnNbr}`);
    await _createDirectories(path.resolve(targetBackupDir, `Turn ${statusdumpWrapper.turnNbr}`));

    _logToFile(`Backup directory created at ${targetBackupDir}/Turn ${statusdumpWrapper.turnNbr}`);
    backupFilenames = await fsp.readdir(savedgamesPath);

    _logToFile(`Read filenames, backing up files...`);
    await _backupFiles(backupFilenames, savedgamesPath, path.resolve(targetBackupDir, `Turn ${statusdumpWrapper.turnNbr}`))

    _logToFile(`Finished backing up turn files, cleaning old ones...`);
    await _cleanUnusedBackups(statusdumpWrapper);

    _logToFile(`Finished backup process! Exiting...`);
    process.exit();
}


function _cloneStatusdump(gameName)
{
    return Promise.resolve()
    .then(() =>
    {
        if (fs.existsSync(clonedStatusdumpDir) === false)
        {
            _logToFile(`Statusdump clone path ${clonedStatusdumpDir} does not exist; creating it...`);
            return fsp.mkdir(clonedStatusdumpDir);
        }

        else return Promise.resolve();
    })
    .then(() => statusDump.cloneStatusDump(gameName, clonedStatusdumpDir));
}

function _createDirectories(targetBackupDir)
{
    var directories = [];
    var currentPath = path.dirname(targetBackupDir);

    while (currentPath !== path.dirname(currentPath))
    {
        directories.unshift(currentPath);
        currentPath = path.dirname(currentPath);
    }

    return directories.forEachPromise((dir, index, nextPromise) =>
    {
        if (fs.existsSync(dir) === false)
        {
            return fsp.mkdir(dir)
            .then(() => nextPromise());
        }
            
        else return nextPromise();
    })
    .catch((err) => Promise.reject(err));
}

function _backupFiles(filenames, sourcePath, targetPath)
{
    return filenames.forAllPromises((filename) =>
    {
        _logToFile(`Checking ${filename}...`);
        
        if (extensionsToBackupRegex.test(filename) === false)
            return _logToFile(`Not a turn file; skipping.`);

            _logToFile(`Turn file found, backing up...`);

        return rw.copyFile(path.resolve(sourcePath, filename), path.resolve(targetPath, filename))
        .then(() => _logToFile(`Turn file backed up.`))
        .catch((err) => Promise.reject(err));
    })
    .catch((err) => Promise.reject(err));
}

function _cleanUnusedBackups(statusDump)
{
    // If turn number is lower than number of backups to keep, no need to clean
    if (statusDump.turnNbr <= configStore.nbrOfTurnsBackedUp)
    {
        _logToFile(`No old turn backups to clean.`);
        return Promise.resolve();
    }

    // Otherwise, delete previous backups according to the configuration
    const turnNbrToClean = statusDump.turnNbr - configStore.nbrOfTurnsBackedUp;

    return cleaner.deleteBackupsUpToTurn(targetBackupDir, turnNbrToClean)
    .catch((err) => Promise.reject(err));
}


function _logToFile(str)
{
    writeStream.write(`${_getTimestamp()}\t${str}\n`);
}

function _getTimestamp()
{
    return new Date(Date.now()).toISOString().replace(/^(.+)(T)/i, "$1$2 ");
}