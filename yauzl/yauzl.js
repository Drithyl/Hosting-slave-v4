
//Yet Another Unzip Library. Docs: https://www.npmjs.com/package/yauzl
const yauzl = require("yauzl");

exports.openZipfile = (filePath) =>
{
    var readZipfile;

    return _openZipfile(filePath)
    .then((zipfile) => 
    {
        readZipfile = zipfile;
        return _fetchZipEntries(readZipfile)
    })
    .then((entries) => Promise.resolve(entries, readZipfile));
};

exports.extractEntriesTo = (entries, zipfile, writePath) =>
{
    return _writeEntriesTo(entries, zipfile, writePath);
};

function _openZipfile(filePath)
{
  return new Promise((resolve, reject) =>
  {
    yauzl.open(filePath, {lazyEntries: true, autoClose: false}, function(err, zipfile)
    {
        if (err)
        {
            rw.log(["upload", "error"], `Error occurred when opening ${fileId}:\n\n${err.message}`);
            return reject(err);
        }

        resolve(zipfile);
    });
  });
}

function _fetchZipEntries(zipfile)
{
  let entries = [];

  //emits "entry" event once it's done reading an entry
  zipfile.readEntry();

  return new Promise((resolve, reject) =>
  {
    zipfile.on("error", (err) =>
    {
        rw.log("upload", `readEntry() error`, err);
        reject(err);
    });

    zipfile.on("entry", (entry) =>
    {
        entries.push(entry);
        zipfile.readEntry();
    });

    //last entry was read, we can resolve now
    zipfile.on("end", () => resolve(entries);
  });
}

function _writeEntriesTo(entries, zipfile, writePath)
{
    return entries.forEachPromise((entry, index, nextPromise) =>
    {
        zipfile.openReadStream(entry, (err, readStream) =>
        {
            //if error, add to error messages and continue looping
            if (err)
            {
                rw.log("upload", `Error opening a readStream at path ${dataPath}/${entry.fileName}.`);
                return Promise.reject(err);
            }

            return _writeEntry(writePath, readStream)
            .then(() => nextPromise())
        });
    });
}

function _writeEntry(writePath, readStream)
{
    let writeStream = fs.createWriteStream(writePath);

    return new Promise((resolve, reject) =>
    {
        readStream.on("error", (err) =>
        {
            rw.log("upload", `Error occurred during readStream for file ${entry.fileName}:`, err);
            return reject(err);
        });

        //finished reading, move on to next entry
        readStream.on("end", () => rw.log("upload", `Map file ${entry.fileName} read.`));

        readStream.pipe(writeStream)
        .on('error', (err) =>
        {
            rw.log("upload", `Error occurred during writeStream for file ${entry.fileName}:`, err);
            reject(err);
        })
        .on('finish', () => resolve());
    });
}