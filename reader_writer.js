
/** Required here for when the backup_script executes helper functions,
/*  as they are called as a separate Node instance */
require("./helper_functions.js");

const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const configStore = require("./config_store.js");

const _tmpDataPath = path.resolve(configStore.dom5DataPath, configStore.tmpFilesDirName);

if (fs.existsSync(_tmpDataPath) === false)
	fs.mkdirSync(_tmpDataPath);


module.exports.copyFile = function(source, target)
{
	log.general(log.getVerboseLevel(), `Copying file ${source} to ${target}...`);
	return exports.checkAndCreateFilePath(target)
	.then(() => 
	{
		log.general(log.getVerboseLevel(), `Dirs created, reading file ${source}`);
		return fsp.readFile(source);
	})
    .then((buffer) => 
	{
		log.general(log.getVerboseLevel(), `File read, writing to ${target}`);
		return fsp.writeFile(target, buffer);
	})
    .then(() => 
	{
		log.general(log.getVerboseLevel(), `File copied`);
		return Promise.resolve();
	})
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

module.exports.deleteDir = function(dirPath)
{
    if (fs.existsSync(dirPath) === false)
        return Promise.resolve();
        
    return fsp.readdir(dirPath)
    .then((filenames) =>
    {
        return filenames.forAllPromises((filename) =>
        {
            const filePath = path.resolve(dirPath, filename);

            return fsp.lstat(filePath)
            .then((stats) =>
            {
                if (stats.isDirectory() === true)
                    return exports.deleteDir(filePath);

                return fsp.unlink(filePath);
            });
        })
    })
    .then(() => fsp.rmdir(dirPath))
    .catch((err) => Promise.reject(err));
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

module.exports.walkDir = function(dir)
{
	const results = [];

	return _walk(dir);

	function _walk(dir)
	{
		return new Promise((resolve, reject) =>
		{
			fsp.readdir(dir)
			.then((list) =>
			{
				var pending = list.length;

				if (pending <= 0)
					return resolve(results);

				list.forEach((file) =>
				{
					file = path.resolve(dir, file);

					fsp.stat(file)
					.then((stat) =>
					{
						if (stat.isDirectory() === true)
						{
							_walk(file)
							.then((res) => 
							{
								results.concat(res);
								pending--;

								if (pending <= 0)
									return resolve(results);
							});
						}

						else
						{
							results.push(file);
							pending--;

							if (pending <= 0)
								return resolve(results);
						}
					});
				})
			})
			.catch((err) => reject(err));
		});
	}
};

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