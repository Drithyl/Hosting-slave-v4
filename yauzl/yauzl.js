
//Yet Another Unzip Library. Docs: https://www.npmjs.com/package/yauzl
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const yauzl = require("yauzl");
const log = require("../logger.js");

exports.extractTo = (zipfilePath, targetPath, filterFn = null) =>
{
    return _openZipfile(zipfilePath)
    .then((zipfile) => _writeEntriesTo(zipfile, targetPath, filterFn));
};

function _openZipfile(filePath)
{
    return new Promise((resolve, reject) =>
    {
        /** refer to https://github.com/thejoshwolfe/yauzl for docs on lazyEntries and autoClose behaviour */
        yauzl.open(filePath, { lazyEntries: true, autoClose: false }, function(err, zipfile)
        {
            if (err)
            {
                log.error(log.getLeanLevel(), `ERROR WHEN OPENING ${fileId}`, err);
                return reject(err);
            }

            resolve(zipfile);
        });
    });
}

function _writeEntriesTo(zipfile, targetPath, filterFn = null)
{
    const skippedEntries = [];
    const writtenEntries = [];

    //emits "entry" event once it's done reading an entry
    zipfile.readEntry();

    return new Promise((resolve, reject) =>
    {
        zipfile.on("error", (err) =>
        {
            log.error(log.getNormalLevel(), `readEntry() ERROR`, err);
            zipfile.close();
            reject(err);
        });

        zipfile.on("entry", (entry) =>
        {
            /** skip if entry does not pass filter */
            if (typeof filterFn === "function" && filterFn(entry) !== true)
            {
                skippedEntries.push(entry.fileName);
                return zipfile.readEntry();
            }

            _writeEntryTo(entry, zipfile, targetPath)
            .then(() => 
            {
                writtenEntries.push(entry.fileName);
                zipfile.readEntry();
                return Promise.resolve();
            })
            .catch((err) => 
            {
                zipfile.close();
                reject(err);
            });
        });

        //last entry was read, we can resolve now
        zipfile.on("end", () => 
        {
            zipfile.close();
            resolve({ writtenEntries, skippedEntries });
        });
    });
}

function _writeEntryTo(entry, zipfile, targetPath)
{
    const entryWritePath = path.resolve(targetPath, entry.fileName);
    const filename = entry.fileName;

    if (/\/$/.test(filename) === true)
        return _writeDirectory(entryWritePath);

    else return _writeFile(entry, zipfile, entryWritePath);
}

function _writeDirectory(dirWritePath)
{
    /** directory entries come with a / at the end of the name */
    const trimmedPath = dirWritePath.slice(0, -1);

    if (fs.existsSync(trimmedPath) === true)
        return Promise.resolve();

    return fsp.mkdir(trimmedPath);
}

function _writeFile(entry, zipfile, entryWritePath)
{
    const writeStream = fs.createWriteStream(entryWritePath);

    return _openReadStream(zipfile, entry)
    .then((readStream) => 
    {
        return new Promise((resolve, reject) =>
        {
            readStream.on("error", (err) =>
            {
                log.error(log.getNormalLevel(), `READSTREAM ERROR WITH FILE ${entry.fileName}`, err);
                return reject(err);
            });
    
            //finished reading, move on to next entry
            readStream.on("end", () => log.upload(log.getVerboseLevel(), `File ${entry.fileName} read.`));
    
            readStream.pipe(writeStream)
            .on('error', (err) =>
            {
                log.error(log.getLeanLevel(), `WRITESTREAM ERROR WITH FILE ${entry.fileName}`, err);
                reject(err);
            })
            .on('finish', () => 
            {
                log.upload(log.getVerboseLevel(), `File ${entry.fileName} written.`);
                resolve()
            });
        });
    });
}

function _openReadStream(zipfile, entry)
{
    return new Promise((resolve, reject) =>
    {
        zipfile.openReadStream(entry, (err, readStream) =>
        {
            //if error, add to error messages and continue looping
            if (err)
            {
                log.error(log.getLeanLevel(), `ERROR OPENING READSTREAM AT PATH ${writePath}.`);
                return reject(err);
            }
    
            resolve(readStream);
        });
    });
}