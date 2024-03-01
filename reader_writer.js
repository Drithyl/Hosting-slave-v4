
/** Required here for when the backup_script executes helper functions,
/*  as they are called as a separate Node instance */
require("./helper_functions.js").init();

const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");


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


module.exports.copyFile = function(source, target)
{
	return exports.checkAndCreateFilePath(target)
	.then(() => fsp.readFile(source))
    .then((buffer) => fsp.writeFile(target, buffer))
    .catch((err) => Promise.reject(err));
};

module.exports.copyDir = function(source, target, deepCopy, extensionFilter = null)
{
	if (fs.existsSync(source) === false)
		return Promise.reject(new Error(`The source path ${source} does not exist.`));

	return fsp.readdir(source)
	.then((filenames) => 
	{
		log.general(log.getVerboseLevel(), `Source directory to be copied read; ${source}`, filenames);
		
		if (filenames.length <= 0)
			return Promise.reject(new Error(`The directory to copy from is empty.`));
			

		return filenames.forAllPromises((filename) =>
		{
			return Promise.resolve()
			.then(() =>
			{
				//if there's a directory inside our directory and no extension filter, copy its contents too
				if (deepCopy === true && fs.lstatSync(`${source}/${filename}`).isDirectory() === true)
				{
					log.general(log.getVerboseLevel(), `Directory found, calling copyDir on it`);
					return exports.copyDir(`${source}/${filename}`, `${target}/${filename}`, deepCopy, extensionFilter);
				}

				else if (_doesExtensionMatchFilter(filename, extensionFilter) === true)
				{
					log.general(log.getVerboseLevel(), "File found, copying it...");
					return exports.copyFile(`${source}/${filename}`, `${target}/${filename}`);
				}

				//ignore file and loop
				else 
				{
					log.general(log.getVerboseLevel(), "Ignoring file and loop");
					return Promise.resolve();
				}
			});
		});
    })
    .catch((err) => Promise.reject(err));
};

module.exports.deleteDir = async function(dirPath)
{
    if (fs.existsSync(dirPath) === false)
        return Promise.resolve();
        
    var filenames = await fsp.readdir(dirPath);
	const promises = filenames.map(async (filename) =>
	{
		const filePath = path.resolve(dirPath, filename);
		const stats = await fsp.lstat(filePath);
		
		if (stats.isDirectory() === true)
			return await exports.deleteDir(filePath);

		return await fsp.unlink(filePath);
	});

	await Promise.allSettled(promises);
	return fsp.rmdir(dirPath);
};

//Guarantees that the targeted path will be left either completely deleted,
//or exactly as it was before this function was called. The files are renamed
//to a tmp directory. It may happen that the files moved to the tmp dir fail
//to be cleaned up, in which case no error will be emitted, and instead it will
//call back as if successful. 
//DOES NOT SUPPORT CROSS-DEVICE DELETING (i.e. paths between different hard drives
//or devices). Both the tmp dir specified in the config and the target must be on the same drive
module.exports.atomicRmDir = async function(targetDir, filter = null)
{
	let stats;
	let filenames;
	let renamedFiles = [];
	let wasDirLeftEmpty = true;
	let targetName = path.basename(targetDir);
	let tmpPath = path.resolve(_tmpDataPath, targetName);

	if (fs.existsSync(targetDir) === false)
		throw new Error(`ENOENT: target path "${targetDir}" does not exist.`);

	stats = await fsp.stat(targetDir);
	
	if (stats.isDirectory() === false)
		throw new Error(`Target is not a directory.`);
	
	//Create tmp dir for the files if it doesn't exist
	if (fs.existsSync(tmpPath) === false)
		await fsp.mkdir(tmpPath);

	filenames = await fsp.readdir(targetDir);
    
	await filenames.forAllPromises(async (filename) =>
	{
		var filePath = path.resolve(targetDir, filename);
		var newFilePath = path.resolve(tmpPath, filename);
		var fileStats = await fsp.stat(filePath);
		
		if (fileStats.isFile() === false || _doesExtensionMatchFilter(filename, filter) === false)
		{
			wasDirLeftEmpty = false;
			return;
		}
			
		await fsp.rename(filePath, newFilePath);

		//keep track of the renamedFiles by pushing an array with [0] oldPath and [1] temp path to be removed later
		renamedFiles.push([filePath, newFilePath]);
	});
	
	//renaming to tmp directory complete,
	//now delete all those files to clean up
	await renamedFiles.forAllPromises((filePaths) =>
	{
		//unlink renamed file at new tmp path
		return fsp.unlink(filePaths[1])
		.catch((err) =>
		{
			//do not stop execution of the loop on error since failure to clean
			//the tmp files is not critical to this operation
			log.error(log.getLeanLevel(), `FAILED TO DELETE TMP FILE ${filePaths[1]}`);
		});
	});

	//delete dir if it's left empty and the files were not filtered
	if (wasDirLeftEmpty === true)
		await fsp.rmdir(targetDir);
		
	return fsp.rmdir(tmpPath)
	.catch((err) =>
	{
		log.error(log.getLeanLevel(), `ATOMIC RM ERROR`, err);

		//undo the whole delete operation
		return _undo(err);
	});

	//if one of the rename operations fail, call undo to undo the successfully
	//renamed files to enforce the atomicity of the whole operation
	function _undo(deleteErr)
	{
		return renamedFiles.forAllPromises((filePaths) =>
		{
			return fsp.rename(filePaths[1], filePaths[0])
			.catch((err) => Promise.reject(new Error(`Critical error during deletion; could not undo the files deleted so far: ${err.message}`)))
		})
		.then(() => fsp.rmdir(tmpPath))
        .then(() => Promise.reject(new Error(`Deletion could not be performed: ${deleteErr.message}`)))
        .catch((err) => Promise.reject(new Error(`Deletion could not be performed; could not undo the files deleted so far: ${err.message}`)));
	}
};

//If a directory does not exist, this will create it
module.exports.checkAndCreateDirPath = function(dirPath)
{
    var directories = [];
    var currentPath = dirPath;

	if (fs.existsSync(dirPath) === true)
		return Promise.resolve();

    while (currentPath !== path.dirname(currentPath))
    {
        directories.unshift(currentPath);
        currentPath = path.dirname(currentPath);
    }

    return directories.forEachPromise((dir, index, nextPromise) =>
    {
        if (fs.existsSync(dir) === false)
        {
            return fsp.mkdir(dir)
            .then(() => nextPromise());
        }
            
        else return nextPromise();
    })
    .catch((err) => Promise.reject(err));
};

//If the dir path up to a filename does not exist, this will create it
module.exports.checkAndCreateFilePath = function(filePath)
{
    var directories = [];
    var currentPath = path.dirname(filePath);

	if (fs.existsSync(currentPath) === true)
		return Promise.resolve();

    while (currentPath !== path.dirname(currentPath))
    {
        directories.unshift(currentPath);
        currentPath = path.dirname(currentPath);
    }

    return directories.forEachPromise((dir, index, nextPromise) =>
    {
        if (fs.existsSync(dir) === false)
        {
            return fsp.mkdir(dir)
            .then(() => nextPromise());
        }
            
        else return nextPromise();
    })
    .catch((err) => Promise.reject(err));
};

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

module.exports.append = (filePath, stringData) =>
{
	const dirPath = filePath.replace(/\/\w+\.\w+$/, "");

	if (fs.existsSync(dirPath) === false)
		return Promise.reject(new Error(`Directory ${dirPath} does not exist.`));

	if (fs.existsSync(filePath) === false)
		return fsp.writeFile(filePath, stringData);
		
	else return fsp.appendFile(filePath, stringData);
};


function _doesExtensionMatchFilter(filename, filter)
{
	var extensionMatch = filename.match(/\..+$/i);

	if (Array.isArray(filter) === false)
		return true;

	if (filter.includes("") === true && extensionMatch == null)
		return true;

	if (filter.includes(extensionMatch[0]))
		return true;
	
	else return false;
}