
const fs = require("fs");
const fsp = require("fs").promises;
const unzip = require("./yauzl/yauzl.js");
const config = require("./config.json");
const rw = require("./reader_writer.js");

const googleDriveAPI = require("./google_drive_api/index.js");

//These are the extensions expected in the collection of map files
const mapExtensionTest = new RegExp("(\.map)|(\.rgb)|(\.tga)|(\.png)$", "i");

//These are the extensions expected in the collection of mod files
const modExtensionTest = new RegExp("(\.dm)|(\.rgb)|(\.tga)|(\.png)|(\.sw)$", "i");

const zipMaxSize = config.maxFileSizeInMB * 2000000;  //200MB in bytes

if (fs.existsSync(config.tmpDownloadPath) === false)
{
    //create temporary download path if it doesn't exist
    fs.mkdirSync(config.tmpDownloadPath);
}


module.exports.downloadMap = (fileId) =>
{
    const path = `${config.dom5DataPath}/maps`;
    return _downloadFile(fileId, path, mapExtensionTest);
};

module.exports.downloadMod = (fileId) =>
{
    const path = `${config.dom5DataPath}/mods`;
    return _downloadFile(fileId, path, modExtensionTest);
};


function _downloadFile(fileId, targetPath, extensionFilter)
{
    const downloadPath = `${config.tmpDownloadPath}/${fileId}.zip`;

    rw.log("upload", `Obtaining metadata of file id ${fileId}...`);

    //obtain the file metadata (name, extension, size) first and then check that it qualifies to be downloaded
    return googleDriveAPI.fetchFileMetadata(fileId)
    .then((metadata) =>
    {
        //The fileExtension property does not include the "." at the beginning of it
        if (metadata.fileExtension !== "zip")
        {
            rw.log("upload", `File id ${fileId} is not a zipfile.`);
            return Promise.reject(new Error("Only .zip files are supported. Please send the file id of a .zip file so it can be unzipped into the proper directory."));
        }

        //won't support zips of over 100MB (metadata size is in bytes)
        if (metadata.size > zipMaxSize)
        {
            rw.log("upload", `File id ${fileId} has a size of ${metadata.size}, which is beyond the limit of ${zipMaxSize}.`);
            return Promise.reject(new Error(`For bandwith reasons, your file cannot be over ${zipMaxSize * 0.000001}MB in size. Please choose a smaller file.`));
        }
        
        rw.log("upload", `Downloading and fetching zipfile ${fileId}...`);

        //obtain the zipfile in proper form through yauzl
        return googleDriveAPI.downloadFile(fileId, downloadPath);
    })
    .then(() => unzip.extractTo(downloadPath, targetPath, (entry) => _filterEntry(entry, extensionFilter, targetPath)))
    .then((result) =>
    {
        rw.log("upload", `Entries written successfully.`);
        
        _cleanupTmpFiles(fileId)
        .catch((err) => rw.log("upload", `Could not clear tmp files:\n\n${err.message}`));

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
        rw.log("upload", `Data file ${entry.fileName} contains underscores at the beginning of its name, removing them.`);
        entry.fileName = entry.fileName.replace(/^\_+/g, "");
    }

    if (fs.existsSync(`${targetPath}/${entry.fileName}`) === true)
        rw.log("upload", `File ${entry.fileName} already exists; skipping.`);

    //directories finish their name in /, keep these as well to preserve mod structure
    else if (/\/$/.test(entry.fileName) === true)
    {
        rw.log("upload", `Keeping directory ${entry.fileName}.`);
        return true;
    }

    //select only the relevant files to extract (directories are included
    //so that a mod's structure can be preserved properly)
    else if (extensionFilter.test(entry.fileName) === true)
    {
        rw.log("upload", `Keeping data file ${entry.fileName}.`);
        return true;
    }

    else rw.log("upload", `Skipping file ${entry.fileName}.`);
}

//We're not using a callback because if the execution fails, we'll just print it
//to the bot log; the user doesn't need to know about it.
function _cleanupTmpFiles(fileId)
{
    let path = `${config.tmpDownloadPath}/${fileId}`;

    rw.log("upload", `Deleting temp zipfile ${fileId}...`);

    if (fs.existsSync(`${path}.zip`) === false && fs.existsSync(path) === false)
    {
        rw.log("upload", `Temp zipfile ${fileId} did not exist.`);
        return Promise.resolve();
    }

    else if (fs.existsSync(`${path}.zip`) === true && fs.existsSync(path) === false)
    {
        path = `${path}.zip`;
    }

    return fsp.unlink(path)
    .then(() => rw.log("upload", `Temp zipfile ${fileId} was successfully deleted.`))
    .catch((err) => rw.log("upload", `Failed to delete the temp zipfile ${fileId}:\n\n${err.message}`));
}
