// Initialize Env Variables
require("dotenv").config();

// Required here for when the backup_script executes helper functions, as they are called as a separate Node instance
require("../utilities/type-utilities.js").extendTypes();

const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("../logger.js");
const { TMP_DIR_PATH } = require("../constants.js");

if (fs.existsSync(TMP_DIR_PATH) === false)
	fs.mkdirSync(TMP_DIR_PATH);


module.exports.getDirFilenames = function(dirPath, extensionFilter = "")
{
	var readFilenames = [];

	if (fs.existsSync(dirPath) === false)
		return Promise.reject(new Error(`The directory ${dirPath} was not found on the server.`));

	return fsp.readdir(dirPath, "utf8")
	.then((filenames) =>
	{
		filenames.forEach((filename) =>
		{
			if (extensionFilter === "" || path.extname(filename) === extensionFilter)
                readFilenames.push(filename);
        });
        
        return Promise.resolve(readFilenames);
	});
};

module.exports.isDirEmpty = async function(dirPath)
{
	if (fs.existsSync(dirPath) === false)
		throw new Error(`Path does not exist: ${dirPath}`);

	// Open dir to create an iterator object
	const dirIter = await fsp.opendir(dirPath);

	// Get next value of iterator in dir (next file)
    const { value, done } = await dirIter[Symbol.asyncIterator]().next();

	// If still not done, close dir
    if (!done)
        await dirIter.close()

	// If done is true, dir is empty
    return done;
};

module.exports.keepOnlyFilesWithExt = async function(dirPath, extensionFilter)
{
	extensionFilter = (Array.isArray(extensionFilter) === true) ? extensionFilter : [ extensionFilter ];

	await exports.walkDir(dirPath, async (filePath, fileStat) =>
    {
        const ext = path.extname(filePath);

        if (fileStat.isDirectory() === true && extensionFilter.includes(ext) === false)
        {
            const isDirEmpty = await exports.isDirEmpty(filePath);
            if (isDirEmpty === true) await fsp.rmdir(filePath);
        }

        else if (extensionFilter.includes(ext) === false)
        	await fsp.unlink(filePath);
    });
}

module.exports.readDirContents = function(dirPath, extensionFilter)
{
    var readFiles = {};

	if (fs.existsSync(dirPath) === false)
        return Promise.reject(new Error(`Directory ${dirPath} was not found on the server.`));
        
    return exports.getDirFilenames(dirPath, extensionFilter)
    .then((filenames) =>
    {
        return filenames.forAllPromises((filename) => 
        {
            return fsp.readFile(path.resolve(dirPath, filename), "utf8")
            .then((contents) => readFiles[filename] = contents)
            .catch((err) => Promise.reject(err));
        });
    })
    .then(() => Promise.resolve(readFiles));
};

// Discord only supports attachments of up to 8MB without Nitro
module.exports = function readFileBuffer(filePath, maxSizeInMB = 8)
{  
    var fileSizeInMB;

    if (fs.existsSync(filePath) === false)
        return Promise.reject(`Path ${filePath} does not exist.`);

    return fsp.stat(filePath)
    .then((stats) =>
    {
        fileSizeInMB = stats.size / 1000000.0;

        if (fileSizeInMB > maxSizeInMB)
            return Promise.reject(`The turn file weighs ${fileSizeInMB}MB; max file size was set at ${maxSizeInMB}`);
        
        return fsp.readFile(filePath);
    })
    .then((buffer) =>
    {
        log.general(log.getNormalLevel(), `Buffer for ${filePath} successfully read.`);
        return Promise.resolve(buffer);
    });
};

module.exports.readStreamToString = (path) =>
{
	const readStream = fs.createReadStream(path);
	const chunks = [];
	
	return new Promise((resolve, reject) =>
	{
		readStream.on("data", (chunk) => chunks.push(chunk));
		readStream.on("error", (err) => reject(err));
		readStream.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
	});
};

// Get all filepaths inside a directory, even within
// directories inside it. Also applies an action to
// each file and subdirectory, if action is a function
module.exports.walkDir = async function(dir, action)
{
	const results = [];

	// Ensure action is a function to
	// avoid errors, even if empty
	if (typeof action !== "function")
		action = () => {};

	// Start the walk recursive algorithm below
	return _walk(dir);

	async function _walk(dir)
	{
		// Get filenames of this dir
		const filenames = await fsp.readdir(dir);

		// If no filenames, return
		if (filenames.length <= 0)
			return results;

		// Iterate through all filenames
		for await (var file of filenames)
		{
			// Get the filename path
			file = path.resolve(dir, file);
			const stat = await fsp.stat(file);

			// If it's a subdirectory, walk it too,
			// add its results to current ones, and
			// apply the action function if any
			if (stat.isDirectory() === true)
			{
				const localResult = await _walk(file);
				results.concat(localResult);
				results.push(file);
				await action(file, stat);
			}

			// If it's a file, just push it to our
			// list and apply the action function
			else
			{
				results.push(file);
				await action(file, stat);
			}
		}

		return results;
	}
};
