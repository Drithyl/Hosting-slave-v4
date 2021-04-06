
const fs = require("fs");
const fsp = require("fs").promises;
const log = require("./logger.js");
const unzip = require("./yauzl/yauzl.js");
const config = require("./config.json");

const googleDriveAPI = require("./google_drive_api/index.js");

//These are the extensions expected in the collection of map files
const mapExtensionTest = new RegExp("(\.map)|(\.rgb)|(\.tga)|(\.png)$", "i");

//These are the extensions expected in the collection of mod files
const modExtensionTest = new RegExp("(\.dm)|(\.rgb)|(\.tga)|(\.png)|(\.sw)|(\.wav)$", "i");

const zipMaxSize = config.maxFileSizeInMB * 2000000;  //200MB in bytes
const tmpPath = `${config.dataFolderPath}/${config.tmpDownloadPath}`;

if (fs.existsSync(tmpPath) === false)
{
    //create temporary download path if it doesn't exist
    fs.mkdirSync(tmpPath);
}


module.exports.downloadMap = (fileId) =>
{
    return _downloadFile(fileId, config.dom5MapsPath, mapExtensionTest);
};

module.exports.downloadMod = (fileId) =>
{
    return _downloadFile(fileId, config.dom5ModsPath, modExtensionTest);
};


function _downloadFile(fileId, targetPath, extensionFilter)
{
    const downloadPath = `${tmpPath}/${fileId}.zip`;

    log.upload(log.getNormalLevel(), `Obtaining metadata of file id ${fileId}...`);

    //obtain the file metadata (name, extension, size) first and then check that it qualifies to be downloaded
    return googleDriveAPI.fetchFileMetadata(fileId)
    .then((metadata) =>
    {
        //The fileExtension property does not include the "." at the beginning of it
        if (metadata.fileExtension !== "zip")
        {
            log.upload(log.getNormalLevel(), `File id ${fileId} is not a zipfile.`);
            return Promise.reject(new Error("Only .zip files are supported. Please send the file id of a .zip file so it can be unzipped into the proper directory."));
        }

        //won't support zips of over 100MB (metadata size is in bytes)
        if (metadata.size > zipMaxSize)
        {
            log.upload(log.getNormalLevel(), `File id ${fileId} has a size of ${metadata.size}, which is beyond the limit of ${zipMaxSize}.`);
            return Promise.reject(new Error(`For bandwith reasons, your file cannot be over ${zipMaxSize * 0.000001}MB in size. Please choose a smaller file.`));
        }
        
        log.upload(log.getNormalLevel(), `Downloading and fetching zipfile ${fileId}...`);

        //obtain the zipfile in proper form through yauzl
        return googleDriveAPI.downloadFile(fileId, downloadPath);
    })
    .then(() => unzip.extractTo(downloadPath, targetPath, (entry) => _filterEntry(entry, extensionFilter, targetPath)))
    .then((result) =>
    {
        log.upload(log.getNormalLevel(), `Entries written successfully.`);
        
        _cleanupTmpFiles(fileId)
        .catch((err) => log.error(log.getLeanLevel(), `COULD NOT CLEAR TMP DOWNLOAD FILES`, err));

        return Promise.resolve(result);
    });
}

/** function used to filter the entries inside the zipfile. Must return true to be extracted */
function _filterEntry(entry, extensionFilter, targetPath)
{
    //.map files that begin with two underscores __ don't get found
    //properly by the --mapfile flag, so make sure to remove them here
    if (/^\_+/g.test(entry.fileName) === true)
    {
        log.upload(log.getNormalLevel(), `Data file ${entry.fileName} contains underscores at the beginning of its name, removing them.`);
        entry.fileName = entry.fileName.replace(/^\_+/g, "");
    }

    if (fs.existsSync(`${targetPath}/${entry.fileName}`) === true)
        log.upload(log.getNormalLevel(), `File ${entry.fileName} already exists; skipping.`);

    //directories finish their name in /, keep these as well to preserve mod structure
    else if (/\/$/.test(entry.fileName) === true)
    {
        log.upload(log.getNormalLevel(), `Keeping directory ${entry.fileName}.`);
        return true;
    }

    //select only the relevant files to extract (directories are included
    //so that a mod's structure can be preserved properly)
    else if (extensionFilter.test(entry.fileName) === true)
    {
        log.upload(log.getNormalLevel(), `Keeping data file ${entry.fileName}.`);
        return true;
    }

    else log.upload(log.getNormalLevel(), `Skipping file ${entry.fileName}.`);
}

//We're not using a callback because if the execution fails, we'll just print it
//to the bot log; the user doesn't need to know about it.
function _cleanupTmpFiles(fileId)
{
    let path = `${tmpPath}/${fileId}`;

    log.upload(log.getNormalLevel(), `Deleting temp zipfile ${fileId}...`);

    if (fs.existsSync(`${path}.zip`) === false && fs.existsSync(path) === false)
    {
        log.upload(log.getNormalLevel(), `Temp zipfile ${fileId} did not exist.`);
        return Promise.resolve();
    }

    else if (fs.existsSync(`${path}.zip`) === true && fs.existsSync(path) === false)
    {
        path = `${path}.zip`;
    }

    return fsp.unlink(path)
    .then(() => log.upload(log.getNormalLevel(), `Temp zipfile ${fileId} was successfully deleted.`))
    .catch((err) => log.error(log.getNormalLevel(), `FAILED TO DELETE TMP ZIPFILE ${fileId}`, err));
}
