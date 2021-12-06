
const configStore = require("./config_store.js").loadConfig();

const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const rw = require("./reader_writer.js");
const cleaner = require("./unused_files_cleaner.js");
const statusDump = require("./dom5/status_dump_wrapper.js");


const preexecRegex = new RegExp("^preexec$", "i");
const postexecRegex = new RegExp("^postexec$", "i");
const extensionsToBackupRegex = new RegExp("(\.2h)|(\.trn)|(ftherlnd)$", "i");

const gameName = process.argv[2];
const type = process.argv[3];
const savedgamesPath = path.resolve(configStore.dom5DataPath, "savedgames", gameName);
const clonedStatusdumpDir = path.resolve(configStore.dom5DataPath, configStore.tmpFilesDirName, gameName);

var targetBackupDir = path.resolve(configStore.dataFolderPath, "backups", gameName);
var fetchedStatusDump;


log.backup(log.getNormalLevel(), `Backup type ${type} for ${gameName} starting.`);


if (gameName == null)
    return log.error(log.getLeanLevel(), `BACKUP ERROR; NO GAME NAME ARGUMENT RECEIVED`);

if (preexecRegex.test(type) === true)
    targetBackupDir = path.resolve(targetBackupDir, configStore.preHostTurnBackupDirName);

else if (postexecRegex.test(type) === true)
    targetBackupDir = path.resolve(targetBackupDir, configStore.newTurnsBackupDirName);

else return log.error(log.getLeanLevel(), `INVALID BACKUP TYPE RECEIVED; EXPECTED preexec OR postexec, GOT '${type}'`);


Promise.resolve()
.then(() =>
{
    if (preexecRegex.test(type) === true)
    {
        log.backup(log.getNormalLevel(),`Cloning statusdump...`);
        return _cloneStatusdump(gameName);
    }
    
    return Promise.resolve();
})
.then(() => 
{
    log.backup(log.getNormalLevel(),`Fetching statusdump...`);
    return statusDump.fetchStatusDump(gameName, clonedStatusdumpDir);
})
.then((statusDumpWrapper) =>
{
    fetchedStatusDump = statusDumpWrapper;

    if (postexecRegex.test(type) === true)
    {
        // Manually increment turn number for the post-turn backup,
        // as the turn number we have is the one from the previous turn
        statusDumpWrapper.turnNbr++;
        log.backup(log.getNormalLevel(), `This is post-exec, incremented turn nbr`);
    }

    log.backup(log.getNormalLevel(), `Statusdump fetched, turn is ${fetchedStatusDump.turnNbr}`);
    return _createDirectories(path.resolve(targetBackupDir, `Turn ${fetchedStatusDump.turnNbr}`));
})
.then(() => 
{
    log.backup(log.getNormalLevel(), `Backup directory created at ${targetBackupDir}/Turn ${fetchedStatusDump.turnNbr}`);
    return fsp.readdir(savedgamesPath);
})
.then((filenames) => 
{
    log.backup(log.getNormalLevel(), `Read filenames, backing up files...`);
    return _backupFiles(filenames, savedgamesPath, `${targetBackupDir}/Turn ${fetchedStatusDump.turnNbr}`)
})
.then(() =>
{
    log.backup(log.getNormalLevel(), `Finished backing up turn files, cleaning old ones...`);
    return _cleanUnusedBackups(fetchedStatusDump);
})
.then(() => log.backup(log.getNormalLevel(), `Finished backup process! Exiting...`))
.then(() => process.exit())
.catch((err) => 
{
    log.error(log.getLeanLevel(), `BACKUP ERROR`, err);
    process.exit();
});


function _cloneStatusdump(gameName)
{
    return Promise.resolve()
    .then(() =>
    {
        if (fs.existsSync(clonedStatusdumpDir) === false)
        {
            log.backup(log.getNormalLevel(), `Statusdump clone path ${clonedStatusdumpDir} does not exist; creating it...`);
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

    console.log(`Directories to check and create:`, directories);

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
        log.backup(log.getNormalLevel(), `Checking ${filename}...`);
        
        if (extensionsToBackupRegex.test(filename) === false)
            log.backup(log.getNormalLevel(), `Not a turn file; skipping.`);

        log.backup(log.getNormalLevel(), `Turn file found, backing up...`);

        return rw.copyFile(`${sourcePath}/${filename}`, `${targetPath}/${filename}`)
        .then(() => log.backup(log.getNormalLevel(), `Turn file backed up.`))
        .catch((err) => Promise.reject(err));
    })
    .catch((err) => Promise.reject(err));
}

function _cleanUnusedBackups(statusDump)
{
    // If turn number is lower than number of backups to keep, no need to clean
    if (statusDump.turnNbr <= configStore.nbrOfTurnsBackedUp)
    {
        log.backup(log.getNormalLevel(), `No old turn backups to clean.`);
        return Promise.resolve();
    }

    // Otherwise, delete previous backups according to the configuration
    const turnNbrToClean = statusDump.turnNbr - configStore.nbrOfTurnsBackedUp;

    return cleaner.deleteBackupsUpToTurn(targetBackupDir, turnNbrToClean)
    .catch((err) => Promise.reject(err));
}