
const fs = require("fs");
const fsp = require("fs").promises;
const log = require("./logger.js");
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


log.general(log.getNormalLevel(), `Backup type ${type} for ${gameName} starting.`);


if (gameName == null)
    return log.error(log.getLeanLevel(), `BACKUP ERROR; NO GAME NAME ARGUMENT RECEIVED`);

if (preexecRegex.test(type) === true)
    targetBackupDir += `/${config.preHostTurnBackupDirName}`;

else if (postexecRegex.test(type) === true)
    targetBackupDir += `/${config.newTurnsBackupDirName}`;

else return log.error(log.getLeanLevel(), `INVALID BACKUP TYPE RECEIVED; EXPECTED --preexec OR --postexec, GOT '${type}'`);


log.general(log.getNormalLevel(),`Fetching statusdump...`);


statusDump.fetchStatusDump(gameName)
.then((statusDumpWrapper) =>
{
    fetchedStatusDump = statusDumpWrapper;
    const tmpTurnFilePath = `${config.dataFolderPath}/${config.tmpDownloadPath}/${gameName}`;
    log.general(log.getNormalLevel(), `Statusdump fetched, turn is ${statusDumpWrapper.turnNbr}`);

    if (preexecRegex.test(type) === true)
        return _writeTurnNbrToTmpFile(statusDumpWrapper.turnNbr, tmpTurnFilePath);
        
    else if (postexecRegex.test(type) === true)
        return _readTurnNbrFromTmpFile(fetchedStatusDump, tmpTurnFilePath);
})
.then(() => _createDirectories(`${targetBackupDir}/Turn ${fetchedStatusDump.turnNbr}`))
.then(() => 
{
    log.general(log.getNormalLevel(), `Backup directory created at ${targetBackupDir}/Turn ${fetchedStatusDump.turnNbr}`);
    return fsp.readdir(savedgamesPath);
})
.then((filenames) => 
{
    log.general(log.getNormalLevel(), `Read filenames, backing up files...`);
    _backupFiles(filenames, savedgamesPath, `${targetBackupDir}/Turn ${fetchedStatusDump.turnNbr}`)
})
.then(() =>
{
    log.general(log.getNormalLevel(), `Finished backing up turn files, cleaning old ones...`);
    return _cleanUnusedBackups(fetchedStatusDump);
})
.catch((err) => log.error(log.getLeanLevel(), `BACKUP ERROR`, err));


// Pre-exec backup writes the known turn number from the statusdump to a file,
// so that post-exec backup can read it from there. 
function _writeTurnNbrToTmpFile(turnNbr, path)
{
    return fsp.writeFile(path, turnNbr, "utf-8")
    .then(() =>
    {
        log.general(log.getNormalLevel(), `Preexec wrote turn ${turnNbr} to file.`);
        return Promise.resolve();
    })
    .catch((err) =>
    {
        log.error(log.getLeanLevel(), `PRE-EXEC ERROR WRITING TURN ${turnNbr} TO FILE`, err);
        return Promise.resolve();
    });
}

// Read turn number from file left by pre-exec. Post-exec backup does not
// normally know the turn as fetching the statusdump right after a turn
// generated results in a turn number of -1
function _readTurnNbrFromTmpFile(statusDump, path)
{
    return fsp.readFile(path, "utf-8")
    .then((turnNbrString) =>
    {
        log.general(log.getNormalLevel(), `Postexec read turn ${turnNbrString} from file.`);
        statusDump.turnNbr = +turnNbrString + 1;
        return fsp.unlink(path);
    })
    .catch((err) => log.error(log.getLeanLevel(), `POST-EXEC ERROR READING TURN FROM FILE`, err));
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
        log.general(log.getNormalLevel(), `Checking ${filename}...`);
        
        if (extensionsToBackupRegex.test(filename) === false)
        {
            log.general(log.getNormalLevel(), `Not a turn file; skipping.`);
            return nextPromise();
        }

        log.general(log.getNormalLevel(), `Turn file found, backing up...`);

        return rw.copyFile(`${sourcePath}/${filename}`, `${targetPath}/${filename}`)
        .then(() =>
        {
            log.general(log.getNormalLevel(), `Turn file backed up.`);
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
        log.general(log.getNormalLevel(), `No old turn backups to clean.`);
        return Promise.resolve();
    }

    // Otherwise, delete previous backups according to the configuration
    const turnNbrToClean = statusDump.turnNbr - config.nbrOfTurnsBackedUp;

    return cleaner.deleteBackupsUpToTurn(targetBackupDir, turnNbrToClean)
    .catch((err) => Promise.reject(err));
}