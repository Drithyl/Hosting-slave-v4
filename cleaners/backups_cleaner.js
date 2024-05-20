
const path = require("path");
const fsp = require("fs").promises;
const log = require("../logger.js");
const fileUtils = require("../utilities/file-utilities.js");
const { getGamePostTurnBackupPath, getGamePreTurnBackupPath } = require("../utilities/path-utilities.js");


module.exports.deleteAllTurnBackups = async function(gameName)
{
    const pathToNewTurnBackups = getGamePostTurnBackupPath(gameName);
    const pathTPreHostBackups = getGamePreTurnBackupPath(gameName);

    try
    {
        await exports.deleteBackupsUpToTurn(pathToNewTurnBackups, Infinity);
        await exports.deleteBackupsUpToTurn(pathTPreHostBackups, Infinity);
        log.cleaner(log.getLeanLevel(), `All of ${gameName}'s turn backups were cleaned.`);
    }

    catch(err)
    {
        log.cleaner(log.getLeanLevel(), `Could not clean all turn backups: ${err.message}\n\n${err.stack}`);
        throw new Error(`Could not clean all turn backups: ${err.message}`);
    }
};

module.exports.deleteBackupsUpToTurn = async function(dirPath, turnNbrToClean)
{
    // Get filenames of all saved turn directories in the backup path
    const subDirNames = await fileUtils.getDirFilenames(dirPath);
    const promises = subDirNames.map(async (subDirName) =>
    {
        // Delete Turn X backup dir if turn number is lower than the cutoff
        const subDirPath = path.resolve(dirPath, subDirName);
        return await _deleteBackupTurnDirectory(subDirPath, turnNbrToClean);
    });

    await Promise.allSettled(promises);
};


async function _deleteBackupTurnDirectory(dirPath, turnNbrToClean)
{
    const dirName = path.basename(dirPath);
    const stats = await fsp.stat(dirPath);

    // Get turn number from dir name
    const dirTurnNbr = +dirName.replace(/\D*/g, "");

    // If not a turn dir, skip
    if (stats.isDirectory() === false)
        return;

    // If turn dir is more recent than cutoff, skip
    if (dirTurnNbr > turnNbrToClean)
        return;

    try
    {
        // Folders of turns at the number given or before will be deleted
        await fsp.rm(dirPath, { recursive: true });
        log.cleaner(log.getNormalLevel(), `Cleaned backup of turn ${dirTurnNbr}.`);
    }

    catch(err)
    {
        log.cleaner(log.getNormalLevel(), `Could not clean ${dirPath}`, err);
    }
}
