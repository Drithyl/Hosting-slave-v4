
const fs = require("fs");
const fsp = require("fs").promises;
const config = require("./config.json");
const rw = require("./reader_writer.js");
const cleaner = require("./unused_files_cleaner.js");
const statusDump = require("./dom5/status_dump_wrapper.js");

const preexecRegex = new RegExp("^\\-\\-preexec$", "i");
const postexecRegex = new RegExp("^\\-\\-postexec$", "i");
const extensionsToBackupRegex = new RegExp("(\.2h)|(\.trn)|(ftherlnd)$", "i");

const gameName = process.argv[2];
const type = process.argv[3];
const savedgamesPath = `${config.dom5DataPath}/savedgames/${gameName}`;


var targetBackupDir = `${config.dataFolderPath}/backups/${gameName}`;
var fetchedStatusDump;


rw.log(["backup"], `Backup type ${type} for ${gameName} starting.`);


if (gameName == null)
    return rw.log(["error", "backup"], `No game name argument received.`);

if (preexecRegex.test(type) === true)
    targetBackupDir += `/${config.preHostTurnBackupDirName}`;

else if (postexecRegex.test(type) === true)
    targetBackupDir += `/${config.newTurnsBackupDirName}`;

else return rw.log(["error", "backup"], `Invalid backup type received; expected --preexec or --postexec: '${type}'`);


rw.log(["backup"], `Fetching statusdump...`);


statusDump.fetchStatusDump(gameName)
.then((statusDumpWrapper) =>
{
    fetchedStatusDump = statusDumpWrapper;
    const tmpTurnFilePath = `${config.tmpDownloadPath}/${gameName}`;
    rw.log(["backup"], `Statusdump fetched, turn is ${statusDumpWrapper.turnNbr}`);

    if (preexecRegex.test(type) === true)
        return _writeTurnNbrToTmpFile(gameName, statusDumpWrapper.turnNbr, tmpTurnFilePath);
        
    else if (postexecRegex.test(type) === true)
        return _readTurnNbrFromTmpFile(gameName, fetchedStatusDump, tmpTurnFilePath);
})
.then(() => _createDirectories(`${targetBackupDir}/Turn ${fetchedStatusDump.turnNbr}`))
.then(() => 
{
    rw.log(["backup"], `Backup directory created at ${targetBackupDir}/Turn ${fetchedStatusDump.turnNbr}`);
    return fsp.readdir(savedgamesPath);
})
.then((filenames) => 
{
    rw.log(["backup"], `Read filenames, backing up files...`);
    _backupFiles(filenames, savedgamesPath, `${targetBackupDir}/Turn ${fetchedStatusDump.turnNbr}`)
})
.then(() =>
{
    rw.log(["backup"], `Finished backing up turn files, cleaning old ones...`);
    return _cleanUnusedBackups(fetchedStatusDump);
})
.catch((err) => rw.log(["backup", "error"], `Error occurred during backup: ${err.message}\n\n${err.stack}`));



function _writeTurnNbrToTmpFile(gameName, turnNbr, path)
{
    return fsp.writeFile(path, turnNbr, "utf-8")
    .then(() =>
    {
        rw.log(["backup"], `Preexec wrote turn ${turnNbr} to file.`);
        return Promise.resolve();
    })
    .catch((err) =>
    {
        rw.log(["backup"], `Preexec could not write turn ${turnNbr} to file: ${err.message}\n\n${err.stack}`);
        return Promise.resolve();
    });
}

function _readTurnNbrFromTmpFile(gameName, statusDump, path)
{
    return fsp.readFile(path, "utf-8")
    .then((turnNbrString) =>
    {
        rw.log(["backup"], `Postexec read turn ${turnNbrString} from file.`);
        statusDump.turnNbr = +turnNbrString + 1;
        return fsp.unlink(`${config.tmpDownloadPath}/${gameName}`);
    })
    .catch((err) => rw.log(["backup"], `Postexec error when reading turn from file: ${err.message}\n\n${err.stack}`));
}

function _createDirectories(targetBackupDir)
{
    //Linux base paths begin with / so ignore the first empty element
    if (targetBackupDir.indexOf("/") === 0)
        targetBackupDir = targetBackupDir.slice(1);

    var directories = targetBackupDir.split("/");
    var currentPath = directories.shift();

    if (process.platform === "linux")
        currentPath = `/${currentPath}`;

    if (fs.existsSync(currentPath) === false)
        return Promise.reject(new Error(`The base path ${currentPath} specified for the backup target does not exist.`));

    return directories.forEachPromise((dir, index, nextPromise) =>
    {
        currentPath += `/${dir}`;

        if (fs.existsSync(currentPath) === false)
        {
            return fsp.mkdir(currentPath)
            .then(() => nextPromise());
        }
            
        else return nextPromise();
    })
    .catch((err) => Promise.reject(err));
}

function _backupFiles(filenames, sourcePath, targetPath)
{
    return filenames.forEachPromise((filename, index, nextPromise) =>
    {
        rw.log(["backup"], `Checking ${filename}...`);
        
        if (extensionsToBackupRegex.test(filename) === false)
        {
            rw.log(["backup"], `Not a turn file; skipping.`);
            return nextPromise();
        }

        rw.log(["backup"], `Turn file found, backing up...`);

        return rw.copyFile(`${sourcePath}/${filename}`, `${targetPath}/${filename}`)
        .then(() =>
        {
            rw.log(["backup"], `Turn file backed up.`);
            return nextPromise();
        })
        .catch((err) => Promise.reject(err));
    })
    .catch((err) => Promise.reject(err));
}

function _cleanUnusedBackups(statusDump)
{
    // If turn number is lower than number of backups to keep, no need to clean
    if (statusDump.turnNbr <= config.nbrOfTurnsBackedUp)
    {
        rw.log(["backup"], `No old turn backups to clean.`);
        return Promise.resolve();
    }

    // Otherwise, delete previous backups according to the configuration
    const turnNbrToClean = statusDump.turnNbr - config.nbrOfTurnsBackedUp;

    return cleaner.deleteBackupsUpToTurn(targetBackupDir, turnNbrToClean)
    .catch((err) => Promise.reject(err));
}