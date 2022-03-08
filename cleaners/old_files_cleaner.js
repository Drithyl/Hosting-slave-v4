
const fs = require("fs");
const fsp = fs.promises;
const log = require("../logger.js");
const assert = require("../asserter.js");
const rw = require("../reader_writer.js");
const safePath = require("../safe_path.js");
const configStore = require("../config_store.js");

var backupCleaningInterval;
var logCleaningInterval;
var tmpFilesCleaningInterval;


module.exports.startBackupCleanInterval = () =>
{
    const backupsPath = safePath(configStore.dataFolderPath, "backups");

    if (backupCleaningInterval != null)
        clearInterval(backupCleaningInterval);

    backupCleaningInterval = _startDirCleanInterval(backupsPath, configStore.backupsMaxDaysOld, configStore.backupsCleaningInterval);
};

module.exports.startLogCleanInterval = () =>
{
    const logsPath = safePath(configStore.dataFolderPath, "logs");

    if (logCleaningInterval != null)
        clearInterval(logCleaningInterval);

    logCleaningInterval = _startDirCleanInterval(logsPath, configStore.logsMaxDaysOld, configStore.logsCleaningInterval);
};

module.exports.startTmpFilesCleanInterval = () =>
{
    const tmpPath = safePath(configStore.dom5TmpPath);

    if (tmpFilesCleaningInterval != null)
        clearInterval(tmpFilesCleaningInterval);

        // TODO: Add a name filter so only the directories called dom5_* and their subfiles are removed
        tmpFilesCleaningInterval = _startDirCleanInterval(tmpPath, configStore.tmpFilesMaxDaysOld, configStore.tmpFilesCleaningInterval);
};


function _startDirCleanInterval (dirPath, maxDaysOld, interval)
{
    assert.isSafePathToDeleteOrThrow(dirPath);
    const maxDaysOldTimestamp = _getTimestampOfNDaysAgo(maxDaysOld);

    const intervalId = setInterval(async () =>
    {
        var deletedFiles = [];

        try
        {
            deletedFiles = await _cleanDirIfOlderThan(dirPath, maxDaysOldTimestamp);

            if (deletedFiles.length > 0)
                log.cleaner(log.getWriteOnlyLevel(), `Files older than ${maxDaysOld} days deleted`, deletedFiles.join("\n\t") + "\n");
        }

        catch(err)
        {
            log.cleaner(log.getWriteOnlyLevel(), `Error cleaning files older than ${maxDaysOld} days: `, err.stack);

            if (deletedFiles.length > 0)
                log.cleaner(log.getWriteOnlyLevel(), `Some files were still deleted`, deletedFiles.join("\n\t") + "\n");
        }

    }, interval);

    return intervalId;
}

function _getTimestampOfNDaysAgo(nDaysAgo)
{
    const today = new Date();
    const oldDate = new Date(new Date().setDate(today.getDate() - nDaysAgo));
    return oldDate.getTime();
}

async function _cleanDirIfOlderThan(dirPath, olderThanTimestamp)
{
    const deletedFiles = [];

    if (fs.existsSync(dirPath) === false)
        return deletedFiles;

    await rw.walkDir(dirPath, async (filePath, fileStat) =>
    {
        const wasDeleted = await _deleteFileIfOlderThan(filePath, fileStat, olderThanTimestamp);
        if (wasDeleted === true) deletedFiles.push(filePath);
    });

    return deletedFiles;
}

async function _deleteFileIfOlderThan(filePath, fileStat, olderThanTimestamp)
{
    if (fileStat.mtime.getTime() > olderThanTimestamp)
        return false;


    if (fileStat.isDirectory() === true)
    {
        const isDirEmpty = await rw.isDirEmpty(filePath);
        if (isDirEmpty === true) await fsp.rmdir(filePath);
        return true;
    }

    await fsp.unlink(filePath);
    return true;
}