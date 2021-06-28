
const fs = require("fs");
const fsp = require("fs").promises;
const log = require("./logger.js");
const configStore = require("./config_store.js");
const rw = require("./reader_writer.js");

module.exports.deleteAllTurnBackups = function(gameName)
{
    const target = `${configStore.dataFolderPath}/backups/${gameName}`;
    const pathToNewTurnBackups = `${target}/${configStore.newTurnsBackupDirName}`;
    const pathTPreHostBackups = `${target}/${configStore.preHostTurnBackupDirName}`;

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
        return filenames.forEachPromise((filename, i, nextPromise) =>
        {
            return fsp.stat(`${dirPath}/${filename}`)
            .then((stats) =>
            {
                const dirTurnNbr = +filename.replace(/\D*/g, "");

                if (stats.isDirectory() === false)
                    return nextPromise();

                // Folder of a backup from recent turn, do not clean
                if (dirTurnNbr > turnNbrToClean)
                    return nextPromise();

                // Folders of turns at the number given or before will be deleted
                return rw.deleteDir(`${dirPath}/${filename}`)
                .then(() => 
                {
                    log.general(log.getNormalLevel(), `Cleaned backup of turn ${dirTurnNbr}.`);
                    return nextPromise();
                })
                .catch((err) => 
                {
                    log.error(log.getNormalLevel(), `Could not clean ${filename}`, err);
                    return nextPromise();
                });
            });
        });
    });
};

module.exports.deleteUnusedMaps = (mapsInUse) => _deleteUnusedFilesInDir(mapsInUse, configStore.dom5MapsPath);
module.exports.deleteUnusedMods = (modsInUse) => _deleteUnusedFilesInDir(modsInUse, configStore.dom5ModsPath);


function _deleteUnusedFilesInDir(filesInUse, dirPath)
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
    .then((dirFiles) => _deleteUnusedFiles(dirFiles, relatedFilesInUse))
    .then((deletedFiles) => 
    {
        log.general(log.getLeanLevel(), `In ${dirPath}, deleted files`, deletedFiles);
        return Promise.resolve(deletedFiles);
    })
    .catch((err, deletedFiles) => Promise.reject(err, deletedFiles));
};

/** uses the list of filenames in use to check the file contents and add the
 *  related asset files to the list as well, so they do not get deleted
 */
function _getListOfRelatedFilesInUse(filesInUse, dirPath)
{
    var list = [];
    var path = require("path");

    return filesInUse.forEachPromise((filename, i, nextPromise) =>
    {
        var assetTagssMatch;
        const filePath = path.resolve(dirPath, filename);

        if (fs.existsSync(filePath) === false)
            return nextPromise();

        list.push(filePath);

        return fsp.readFile(filePath, "utf8")
        .then((fileContent) =>
        {
            assetTagssMatch = fileContent.match(/\#(spr|spr1|spr2|icon|flag|indepflag|sample|imagefile|winterimagefile)\s*"?.+"?/ig);

            if (Array.isArray(assetTagssMatch) === false)
                return nextPromise();

            assetTagssMatch.forEach((assetTag) =>
            {
                const relPath = assetTag.replace(/^\#\w+\s*"?(.+)"?$/i, "$1");
                const absolutePath = path.resolve(dirPath, relPath);

                if (fs.existsSync(absolutePath) === true)
                {
                    log.general(log.getNormalLevel(), `Found related file in use at ${absolutePath}`);
                    list.push(absolutePath);
                }

                else log.general(log.getLeanLevel(), `Related file in use found at path ${absolutePath} does not exist?`);
            });

            return nextPromise();
        });
    })
    .then(() => Promise.resolve(list));
}

function _deleteUnusedFiles(filePaths, filesInUse)
{
    var deletedFiles = [];
    var leftToDelete = filePaths.length;
    log.general(log.getLeanLevel(), "Total related files to check for cleaning", leftToDelete);

    if (leftToDelete <= 0)
        return Promise.resolve(deletedFiles);

    return new Promise((resolve, reject) =>
    {
        filePaths.forEach((path) =>
        {
            if (filesInUse.includes(path) === false)
            {
                fsp.unlink(path)
                .then(() =>
                {
                    deletedFiles.push(path);
                    leftToDelete--;
                    console.log(`Deleted unused file ${path}, ${leftToDelete} left`);
                    //log.general(log.getNormalLevel(), `Deleted unused file ${path}`, err);

                    if (leftToDelete <= 0)
                        return resolve(deletedFiles);
                })
                .catch((err) =>
                {
                    leftToDelete--;
                    log.general(log.getLeanLevel(), `Failed to delete file ${path}, ${leftToDelete} left`, err);

                    if (leftToDelete <= 0)
                        return resolve(deletedFiles);
                });
            }

            else
            {
                leftToDelete--;
                console.log(`Skipped file ${path}, ${leftToDelete} left`);

                if (leftToDelete <= 0)
                    return resolve(deletedFiles);
            }
        });
    });
}