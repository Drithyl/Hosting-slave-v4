
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const configStore = require("./config_store.js");
const rw = require("./reader_writer.js");

module.exports.deleteAllTurnBackups = function(gameName)
{
    const target = path.resolve(configStore.dataFolderPath, "backups", gameName);
    const pathToNewTurnBackups = path.resolve(target, configStore.newTurnsBackupDirName);
    const pathTPreHostBackups = path.resolve(target, configStore.preHostTurnBackupDirName);

    return exports.deleteBackupsUpToTurn(pathToNewTurnBackups, Infinity)
    .then(() => exports.deleteBackupsUpToTurn(pathTPreHostBackups, Infinity))
    .then(() =>
    {
        log.general(log.getLeanLevel(), `All of ${gameName}'s turn backups were cleaned.`);
        return Promise.resolve();
    })
    .catch((err) => 
    {
        log.general(log.getLeanLevel(), `Could not clean all turn backups: ${err.message}\n\n${err.stack}`);
        return Promise.reject(new Error(`Could not clean all turn backups: ${err.message}`))
    });
};

module.exports.deleteBackupsUpToTurn = function(dirPath, turnNbrToClean)
{
    // Get filenames of all saved turn directories in the backup path
    return rw.getDirFilenames(dirPath)
    .then((filenames) =>
    {
        return filenames.forAllPromises((filename) =>
        {
            return fsp.stat(path.resolve(dirPath, filename))
            .then((stats) =>
            {
                const dirTurnNbr = +filename.replace(/\D*/g, "");

                if (stats.isDirectory() === false)
                    return;

                // Folder of a backup from recent turn, do not clean
                if (dirTurnNbr > turnNbrToClean)
                    return;

                // Folders of turns at the number given or before will be deleted
                return rw.deleteDir(path.resolve(dirPath, filename))
                .then(() => log.general(log.getNormalLevel(), `Cleaned backup of turn ${dirTurnNbr}.`))
                .catch((err) => log.error(log.getNormalLevel(), `Could not clean ${filename}`, err));
            });
        });
    });
};

module.exports.deleteUnusedMaps = (mapsInUse, force = false) => _deleteUnusedFilesInDir(mapsInUse, configStore.dom5MapsPath, force);
module.exports.deleteUnusedMods = (modsInUse, force = false) => _deleteUnusedFilesInDir(modsInUse, configStore.dom5ModsPath, force);


function _deleteUnusedFilesInDir(filesInUse, dirPath, force = false)
{
    var relatedFilesInUse = [];
    
    if (Array.isArray(filesInUse) === false)
        return Promise.reject(new Error(`Expected filesInUse to be an array, got ${typeof filesInUse} instead.`), []);

    return _getListOfRelatedFilesInUse(filesInUse, dirPath)
    .then((files) => 
    {
        relatedFilesInUse = relatedFilesInUse.concat(files);
        return rw.walkDir(dirPath);
    })
    .then((dirFiles) => _deleteUnusedFiles(dirFiles, relatedFilesInUse, force))
    .then((deletedFiles) => 
    {
        log.general(log.getLeanLevel(), `In ${dirPath}, deleted unused files`);
        return Promise.resolve(deletedFiles);
    })
    .catch((err, deletedFiles) => 
    {
        log.general(log.getLeanLevel(), `Error occurred when deleting unused files in ${dirPath}; files that were still deleted are listed below`, deletedFiles);
        return Promise.reject(err, deletedFiles)
    });
};

/** uses the list of filenames in use to check the file contents and add the
 *  related asset files to the list as well, so they do not get deleted
 */
function _getListOfRelatedFilesInUse(filesInUse, dirPath)
{
    var list = [];

    return filesInUse.forAllPromises((filename) =>
    {
        var assetTagssMatch;
        const filePath = path.resolve(dirPath, filename);

        if (fs.existsSync(filePath) === false)
            return;

        list.push(filePath);

        return fsp.readFile(filePath, "utf8")
        .then((fileContent) =>
        {
            assetTagssMatch = fileContent.match(/\#(spr|spr1|spr2|icon|flag|indepflag|sample|imagefile|winterimagefile)\s*"?.+"?/ig);

            if (Array.isArray(assetTagssMatch) === false)
                return;

            assetTagssMatch.forEach((assetTag) =>
            {
                const relPath = assetTag.replace(/^\#\w+\s*("?.+"?)$/i, "$1").replace(/"/ig, "");
                const absolutePath = path.resolve(dirPath, relPath);

                if (fs.existsSync(absolutePath) === true)
                {
                    log.general(log.getNormalLevel(), `Found related file in use at ${absolutePath}`);
                    list.push(absolutePath);
                }

                else log.general(log.getLeanLevel(), `Related file in use found at path ${absolutePath} does not exist?`);
            });
        });
    })
    .then(() => Promise.resolve(list));
}

function _deleteUnusedFiles(filePaths, filesInUse, force)
{
    var deletedFiles = [];
    log.general(log.getLeanLevel(), "Total related files to check for cleaning", filePaths.length);

    if (filePaths.length <= 0)
        return Promise.resolve(deletedFiles);

    return filePaths.forAllPromises((filePath) =>
    {
        if (filesInUse.includes(filePath) === false)
        {
            return Promise.resolve()
            .then(() =>
            {
                if (force === true)
                    return fsp.unlink(filePath);

                else return Promise.resolve();
            })
            .then(() => deletedFiles.push(filePath))
            .catch((err) => log.general(log.getLeanLevel(), `Failed to delete file ${filePath}`, err));
        }
    })
    .then(() => Promise.resolve(deletedFiles));
}