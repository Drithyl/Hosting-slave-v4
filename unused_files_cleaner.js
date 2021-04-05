
const fs = require("fs");
const fsp = require("fs").promises;
const log = require("./logger.js");
const config = require("./config.json");
const rw = require("./reader_writer.js");

module.exports.deleteAllTurnBackups = function(gameName)
{
    const target = `${config.dataFolderPath}/backups/${gameName}`;
    const pathToNewTurnBackups = `${target}/${config.newTurnsBackupDirName}`;
    const pathTPreHostBackups = `${target}/${config.preHostTurnBackupDirName}`;

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

module.exports.deleteUnusedMaps = function(mapsInUse)
{
    var filesInUse;

    if (Array.isArray(mapsInUse) === false)
        return Promise.reject(new Error(`Expected mapsInUse to be an array, got ${typeof mapsInUse} instead.`), []);

    return _getListOfAllMapfilesInUse(mapsInUse)
    .then((list) => 
    {
        filesInUse = list;
        return fsp.readdir(config.dom5MapsPath)
    })
    .then((mapFilenames) => _deleteUnusedMaps(mapFilenames, filesInUse))
    .catch((err, deletedFiles) => Promise.reject(err, deletedFiles));
};

/** uses the list of map names in use to check the file contents and add the
 *  necessary map image files to the list as well, so they do not get deleted
 */
function _getListOfAllMapfilesInUse(mapsInUse)
{
    var list = [...mapsInUse];

    return mapsInUse.forEachPromise((filename, i, nextPromise) =>
    {
        var imageFilenameMatch;
        var winterImageFilenameMatch;
        const filePath = `${config.dom5MapsPath}/${filename}`;

        if (fs.existsSync(filePath) === false)
            return nextPromise();

        return fsp.readFile(filePath, "utf8")
        .then((fileContent) =>
        {
            imageFilenameMatch = fileContent.match(/\#imagefile .+\.((tga)|(rgb)|(png))/i);
            winterImageFilenameMatch = fileContent.match(/\#winterimagefile .+\.((tga)|(rgb)|(png))/i);

            if (Array.isArray(imageFilenameMatch) === true)
                list.push(imageFilenameMatch[0].replace(/#imagefile /, "").trim());

            if (Array.isArray(winterImageFilenameMatch) === true)
                list.push(winterImageFilenameMatch[0].replace(/#winterimagefile /, "").trim());

            return nextPromise();
        });
    })
    .then(() => Promise.resolve(list));
}

function _deleteUnusedMaps(filenames, mapfilesInUse)
{
  var deletedFiles = [];

  return filenames.forEachPromise((filename, index, nextPromise) =>
  {
    if (mapfilesInUse.includes(filename) === true)
      return nextPromise();

    return fsp.unlink(`${config.dom5MapsPath}/${filename}`)
    .then(() =>
    {
        deletedFiles.push(filename);
        return nextPromise();
    });
  })
  .then(() => Promise.resolve(deletedFiles))
  .catch((err) => Promise.reject(err, deletedFiles));
}