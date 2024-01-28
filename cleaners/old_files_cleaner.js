
const fs = require("fs");
const fsp = fs.promises;
const log = require("../logger.js");
const assert = require("../asserter.js");
const rw = require("../reader_writer.js");
const safePath = require("../safe_path.js");
const configStore = require("../config_store.js");
const { getDominionsDataPath, getDominionsTmpPath } = require("../helper_functions.js");

var logCleaningInterval;
var dom5BackupCleaningInterval;
var dom6BackupCleaningInterval;
var dom5TmpFilesCleaningInterval;
var dom6TmpFilesCleaningInterval;


module.exports.startBackupCleanInterval = () =>
{
    const dom5BackupsPath = safePath(getDominionsDataPath(configStore.dom5GameTypeName), "backups");
    const dom6BackupsPath = safePath(getDominionsDataPath(configStore.dom6GameTypeName), "backups");

    if (dom5BackupCleaningInterval != null)
        clearInterval(dom5BackupCleaningInterval);
    
    if (dom6BackupCleaningInterval != null)
        clearInterval(dom6BackupCleaningInterval);

    dom5BackupCleaningInterval = _startDirCleanInterval(dom5BackupsPath, configStore.backupsMaxDaysOld, configStore.backupsCleaningInterval);
    dom6BackupCleaningInterval = _startDirCleanInterval(dom6BackupsPath, configStore.backupsMaxDaysOld, configStore.backupsCleaningInterval);
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
    const dom5TmpPath = safePath(getDominionsTmpPath(configStore.dom5GameTypeName));
    const dom6TmpPath = safePath(getDominionsTmpPath(configStore.dom6GameTypeName));

    if (dom5TmpFilesCleaningInterval != null)
        clearInterval(dom5TmpFilesCleaningInterval);

    if (dom6TmpFilesCleaningInterval != null)
        clearInterval(dom6TmpFilesCleaningInterval);

    // TODO: Add a name filter so only the directories called dom5_* and their subfiles are removed
    tmpFilesCleaningInterval = _startDirCleanInterval(dom5TmpPath, configStore.tmpFilesMaxDaysOld, configStore.tmpFilesCleaningInterval);

    // TODO: Add a name filter so only the directories called dom6_* and their subfiles are removed
    tmpFilesCleaningInterval = _startDirCleanInterval(dom6TmpPath, configStore.tmpFilesMaxDaysOld, configStore.tmpFilesCleaningInterval);
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
        try
        {
            const wasDeleted = await _deleteFileIfOlderThan(filePath, fileStat, olderThanTimestamp);
            if (wasDeleted === true) deletedFiles.push(filePath);
        }

        catch(err)
        {
            log.cleaner(log.getWriteOnlyLevel(), `Could not delete file "${filePath}": ${err.message}`);
        }
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