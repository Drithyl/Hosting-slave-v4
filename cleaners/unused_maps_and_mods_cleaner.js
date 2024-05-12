
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("../logger.js");
const rw = require("../utilities/file-utilities.js");
const { getDominionsMapsPath, getDominionsModsPath } = require("../utilities/path-utilities.js");


module.exports.deleteUnusedMaps = (mapsInUse, gameType, force = false) => _deleteUnusedFilesInDir(mapsInUse, getDominionsMapsPath(gameType), force);
module.exports.deleteUnusedMods = (modsInUse, gameType, force = false) => _deleteUnusedFilesInDir(modsInUse, getDominionsModsPath(gameType), force);


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
        log.cleaner(log.getLeanLevel(), `In ${dirPath}, deleted unused files`);
        return Promise.resolve(deletedFiles);
    })
    .catch((err, deletedFiles) => 
    {
        log.cleaner(log.getLeanLevel(), `Error occurred when deleting unused files in ${dirPath}; files that were still deleted are listed below`, deletedFiles);
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
                    log.cleaner(log.getNormalLevel(), `Found related file in use at ${absolutePath}`);
                    list.push(absolutePath);
                }

                else log.cleaner(log.getLeanLevel(), `Related file in use found at path ${absolutePath} does not exist?`);
            });
        });
    })
    .then(() => Promise.resolve(list));
}

function _deleteUnusedFiles(filePaths, filesInUse, force)
{
    var deletedFiles = [];
    log.cleaner(log.getLeanLevel(), "Total related files to check for cleaning", filePaths.length);

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
            .catch((err) => log.cleaner(log.getLeanLevel(), `Failed to delete file ${filePath}`, err));
        }
    })
    .then(() => Promise.resolve(deletedFiles));
}