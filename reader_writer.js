
/** Required here for when the backup_script executes helper functions,
/*  as they are called as a separate Node instance */
require("./helper_functions.js");

const fs = require("fs");
const fsp = require("fs").promises;
const config = require("./config.json");

const _tmpDataPath = `${config.dataFolderPath}/tmp`;
const _logsPath = `${config.dataFolderPath}/logs`;
const logTagsToPaths =
{
	"default": `${config.dataFolderPath}/logs/general.txt`,
	"general": `${config.dataFolderPath}/logs/general.txt`,
	"error": `${config.dataFolderPath}/logs/error.txt`,
	"backup": `${config.dataFolderPath}/logs/backup.txt`,
	"upload": `${config.dataFolderPath}/logs/upload.txt`
}

if (fs.existsSync(_tmpDataPath) === false)
	fs.mkdirSync(_tmpDataPath);

if (fs.existsSync(_logsPath) === false)
	fs.mkdirSync(_logsPath);

module.exports.copyFile = function(source, target)
{
	return exports.checkAndCreateFilepath(target)
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
		return filenames.forEachPromise((filename, index, nextPromise) =>
		{
			return Promise.resolve()
			.then(() =>
			{
				//if there's a directory inside our directory and no extension filter, copy its contents too
				if (deepCopy === true && fs.lstatSync(`${source}/${filename}`).isDirectory() === true)
					return exports.copyDir(`${source}/${filename}`, `${target}/${filename}`, deepCopy, extensionFilter);

				else if (_doesExtensionMatchFilter(filename, extensionFilter) === true)
					return exports.copyFile(`${source}/${filename}`, `${target}/${filename}`);

				//ignore file and loop
				else return Promise.resolve();
			})
			.then(() => nextPromise());
		});
    })
    .catch((err) => Promise.reject(err));
};

module.exports.deleteDir = function(path)
{
    if (fs.existsSync(path) === false)
        return Promise.resolve();
        
    return fsp.readdir(path)
    .then((filenames) =>
    {
        return filenames.forEachPromise((filename, index, nextPromise) =>
        {
            const filepath = `${path}/${filename}`;

            return fsp.lstat(filepath)
            .then((stats) =>
            {
                if (stats.isDirectory() === true)
                    return exports.deleteDir(filepath);

                return fsp.unlink(filepath);
            })
            .then(() => nextPromise());
        })
    })
    .then(() => fsp.rmdir(path))
    .catch((err) => Promise.reject(err));
};

//Guarantees that the targeted path will be left either completely deleted,
//or exactly as it was before this function was called. The files are renamed
//to a tmp directory. It may happen that the files moved to the tmp dir fail
//to be cleaned up, in which case no error will be emitted, and instead it will
//call back as if successful. 
//DOES NOT SUPPORT CROSS-DEVICE DELETING (i.e. paths between different hard drives
//or devices). Both the tmp dir specified in the config and the target must be on the same drive
module.exports.atomicRmDir = function(target, filter = null)
{
	let renamedFiles = [];
	let wasDirLeftEmpty = true;
	let targetName = (target.indexOf("/") === -1) ? target : target.slice(target.lastIndexOf("/") + 1);

	if (fs.existsSync(target) === false)
		return Promise.reject(new Error(`ENOENT: target path "${target}" does not exist.`));

	fsp.stat(target)
	.then((stats) =>
	{
		if (stats.isDirectory() === false)
			return Promise.reject(new Error(`Target is not a directory.`));
		
		return Promise.resolve();
	})
    .then(() => 
    {
        //Create tmp dir for the files if it doesn't exist
        if (fs.existsSync(`${_tmpDataPath}/${targetName}`) === false)
            return fsp.mkdir(`${_tmpDataPath}/${targetName}`);

        else return Promise.resolve();
    })
	.then(() => fsp.readdir(target))
	.then((filenames) =>
	{
		return filenames.forEachPromise((filename, index, nextPromise) =>
		{
			return fsp.stat(`${target}/${filename}`)
			.then((stats) =>
			{
				if (stats.isFile() === false || _doesExtensionMatchFilter(filename, filter) === false)
				{
					wasDirLeftEmpty = false;
					return nextPromise();
				}
					
				return fsp.rename(`${target}/${filename}`, `${_tmpDataPath}/${targetName}/${filename}`)
				.then(() => 
				{
					//keep track of the renamedFiles by pushing an array with [0] oldPath and [1] temp path to be removed later
					renamedFiles.push([`${target}/${filename}`, `${_tmpDataPath}/${targetName}/${filename}`]);
					return nextPromise();
				});
			});
		});
	})
	.then(() =>
	{
		//renaming to tmp directory complete,
		//now delete all those files to clean up
		return renamedFiles.forEachPromise((filepaths, index, nextPromise) =>
		{
			//unlink renamed file at new tmp path
			return fsp.unlink(filepaths[1])
			.then(() => nextPromise())
			.catch((err) =>
			{
				//do not stop execution of the loop on error since failure to clean
				//the tmp files is not critical to this operation
				console.log(`Failed to delete remaining tmp file ${filepaths[1]}`);
				return nextPromise();
			});
		});
	})
	.then(() =>
	{
		//delete dir if it's left empty and the files were not filtered
		if (wasDirLeftEmpty === true)
			return fsp.rmdir(target);
		
		else return Promise.resolve();
	})
	.then(() => fsp.rmdir(`${_tmpDataPath}/${targetName}`))
	.catch((err) => 
	{
		console.log(`Error occurred: ${err.message}`);

		//undo the whole delete operation
		return _undo(err);
	});

	//if one of the rename operations fail, call undo to undo the successfully
	//renamed files to enforce the atomicity of the whole operation
	function _undo(deleteErr)
	{
		return renamedFiles.forEachPromise((filepaths, index, nextPromise) =>
		{
			return fsp.rename(filepaths[1], filepaths[0])
			.then(() => nextPromise())
			.catch((err) => Promise.reject(new Error(`Critical error during deletion; could not undo the files deleted so far: ${err.message}`)));
		})
		//remove leftover tmp dir
		.then(() => fsp.rmdir(`${_tmpDataPath}/${targetName}`))
        .then(() => Promise.reject(new Error(`Deletion could not be performed: ${deleteErr.message}`)))
        .catch((err) => Promise.reject(new Error(`Deletion could not be performed; could not undo the files deleted so far: ${err.message}`)));
	}
};

//If a directory does not exist, this will create it
module.exports.checkAndCreateFilepath = function(filepath)
{
	var splitPath = filepath.split("/");
	var compoundPath = splitPath[0];

	return splitPath.forEachPromise((pathSegment, index, nextPromise) =>
	{
		//last element of the path should not be iterated through as it will be a file
		if (index >= splitPath.length - 1)
			return Promise.resolve();

		//prevent empty paths from being created
		if (fs.existsSync(compoundPath) === false && /[\w]/.test(compoundPath) === true)
		{
			return fsp.mkdir(compoundPath)
			.then(() => 
			{
				compoundPath += `/${splitPath[index+1]}`;
				nextPromise();
			});
		}
			
		else
		{
			compoundPath += `/${splitPath[index+1]}`;
			nextPromise();
		}
	});
};

module.exports.getDirFilenames = function(path, extensionFilter = "")
{
	var readFilenames = [];

	if (fs.existsSync(path) === false)
		return Promise.reject(new Error(`The directory ${path} was not found on the server.`));

	return fsp.readdir(path, "utf8")
	.then((filenames) =>
	{
		filenames.forEach((filename) =>
		{
			if (extensionFilter === "" || filename.lastIndexOf(extensionFilter) !== -1)
                readFilenames.push(filename);
        });
        
        return Promise.resolve(readFilenames);
	});
};

module.exports.readDirContents = function(path, extensionFilter)
{
    var readFiles = {};

	if (fs.existsSync(path) === false)
        return Promise.reject(new Error(`Directory ${path} was not found on the server.`));
        
    return exports.getDirFilenames(path, extensionFilter)
    .then((filenames) =>
    {
        return filenames.forEachPromise((filename, index, nextPromise) => 
        {
            return fsp.readFile(`${path}/${filename}`, "utf8")
            .then((contents) =>
            {
                readFiles[filename] = contents;
                nextPromise();
            })
            .catch((err) => Promise.reject(err));
        });
    })
    .then(() => Promise.resolve(readFiles));
};

module.exports.log = function(tags, trace, ...inputs)
{
	var msg = _timestamp() + "\n";

	if (Array.isArray(tags) === false)
		tags = [tags];

	//no trace argument was provided
	if (typeof trace !== "boolean")
	{
		if (Array.isArray(trace) === false)
			trace = [trace];

		inputs = trace.concat(inputs);
	}

	inputs.forEach((input) =>
	{
		if (typeof input === "string")
		{
			//add tab characters to each line so that they are all indented relative to the timestamp
			input.split("\n").forEach((line) => msg += `\t${line}\n`);
		}

		else msg += `\t${_toJSON(input)}\n`;
	});

	console.log(`${msg}\n`);

	if (trace === true)
	{
		console.log("\n\n");
		console.trace();
		console.log("\n\n");
	}

	return tags.forEachPromise((tag, index, nextPromise) =>
	{
		if (logTagsToPaths[tag] == null)
			return nextPromise();

		return fsp.appendFile(logTagsToPaths[tag], `${msg}\r\n\n`)
		.then(() => nextPromise());
    })
    .catch((err) => console.log(`Failed to log: ${err.message}\n\n${err.stack}`));
};

function _timestamp()
{
	var now = new Date();
	var hours = now.getHours();
	var minutes = now.getMinutes();
	var seconds = now.getSeconds();
	var ms = now.getMilliseconds();

	if (hours < 10)
		hours = `0${hours}`;

	if (minutes < 10)
		minutes = `0${minutes}`;

	if (seconds < 10)
		seconds = `0${seconds}`;

	if (ms < 10)
		ms = `00${ms}`;

	else if (ms < 100)
		ms = `0${ms}`;

	return `${hours}:${minutes}:${seconds}:${ms}, ${now.toDateString()}`;
}

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

//Stringify that prevents circular references taken from https://antony.fyi/pretty-printing-javascript-objects-as-json/
function _toJSON(object, spacing = 2)
{
	var cache = [];

	//custom replacer function gets around the circular reference errors by discarding them
	var str = JSON.stringify(object, function(key, value)
	{
		if (typeof value === "object" && value != null)
		{
			//value already found before, discard it
			if (cache.indexOf(value) !== -1)
				return;

			//not found before, store this value for reference
			cache.push(value);
		}

		return value;

	}, spacing);

	//enable garbage collection
	cache = null;
	return str;
}
