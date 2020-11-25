
const fs = require("fs");
const fsp = require("fs").promises;
const config = require("./config.json");

module.exports.deleteUnusedMaps = function(mapsInUse)
{
    var filesInUse;

    if (Array.isArray(mapsInUse) === false)
        return Promise.reject(new Error(`Expected mapsInUse to be an array, got ${typeof mapsInUse} instead.`), []);

    return _getListOfAllMapfilesInUse(mapsInUse)
    .then((list) => 
    {
        filesInUse = list;
        return fsp.readdir(`${config.dom5DataPath}/maps`)
    })
    .then((mapFilenames) => _deleteUnusedMaps(mapFilenames, filesInUse))
    .catch((err) => cb({message: err.message}, []));
};

/** uses the list of map names in use to check the file contents and add the
 *  necessary map image files to the list as well, so they do not get deleted
 */
function _getListOfAllMapfilesInUse(mapsInUse)
{
    var list = [...mapsInUse];
    var path = `${config.dom5DataPath}/maps`;

    return mapsInUse.forEachPromise((filename, i, nextPromise) =>
    {
        var imageFilenameMatch;
        var winterImageFilenameMatch;
        const filePath = `${path}/${filename}`;

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
  var mapDirPath = `${config.dom5DataPath}/maps`;

  return filenames.forEachPromise((filename, index, nextPromise) =>
  {
    if (mapfilesInUse.includes(filename) === true)
      return nextPromise();

    /*fsp.unlink(`${mapDirPath}/${filename}`)
    .then(() =>
    {
        deletedFiles.push(filename);
        return nextPromise();
    });*/

    deletedFiles.push(filename);
    return nextPromise();
  })
  .then(() => Promise.resolve(deletedFiles))
  .catch((err) => Promise.reject(err, deletedFiles));
}