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


module.exports.getDirFilenames = async function(dirPath, extensionFilter = "")
{
	if (fs.existsSync(dirPath) === false)
		throw new Error(`The directory ${dirPath} was not found on the server.`);

	const filenames = await fsp.readdir(dirPath, "utf8");
	
	return filenames.filter((filename) =>
	{
		return extensionFilter === "" || path.extname(filename) === extensionFilter;
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
};

module.exports.readDirContents = async function(dirPath, extensionFilter)
{
    var readFiles = {};

	if (fs.existsSync(dirPath) === false)
        throw new Error(`Directory ${dirPath} was not found on the server.`);
        
    const filenames = await exports.getDirFilenames(dirPath, extensionFilter);

	for (const filename of filenames) {
		const contents = await fsp.readFile(path.resolve(dirPath, filename), "utf8");
		readFiles[filename] = contents;
	}

	return readFiles;
};

// Discord only supports attachments of up to 8MB without Nitro
module.exports.readFileBuffer = async function (filePath, maxSizeInMB = 8)
{
    if (fs.existsSync(filePath) === false)
        throw new Error(`Path ${filePath} does not exist.`);

    const stats = await fsp.stat(filePath);
	const fileSizeInMB = stats.size / 1000000.0;

	if (fileSizeInMB > maxSizeInMB)
		throw new Error(`The turn file weighs ${fileSizeInMB}MB; max file size was set at ${maxSizeInMB}`);
        
    const buffer = await fsp.readFile(filePath);
    log.general(log.getNormalLevel(), `Buffer for ${filePath} successfully read.`);
	return buffer;
};

module.exports.readStreamToString = function (path)
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
		for (let filename of filenames)
		{
			// Get the filename path
			filepath = path.resolve(dir, filename);
			const stat = await fsp.stat(filepath);

			// If it's a subdirectory, walk it too,
			// add its results to current ones, and
			// apply the action function if any
			if (stat.isDirectory() === true)
			{
				const localResult = await _walk(filepath);
				results.concat(localResult);
				results.push(filepath);
				await action(filepath, stat);
			}

			// If it's a file, just push it to our
			// list and apply the action function
			else
			{
				results.push(filepath);
				await action(filepath, stat);
			}
		}

		return results;
	}
};
