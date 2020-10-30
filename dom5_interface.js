
const fs = require("fs");
const fsp = require("fs").promises;
const config = require("./config.json");
const rw = require("./reader_writer.js");
const kill = require("./kill_instance.js");
const spawn = require("./process_spawn.js").spawn;
const gameStore = require("./hosted_games_store.js");
const readFileBuffer = require("./read_file_buffer.js");
const provCountFn = require("./dom5/parse_province_count.js");
const { fetchStatusDump } = require("./dom5/status_dump_wrapper.js");

module.exports.getModList = function()
{
	return rw.getDirFilenames(`${config.dom5DataPath}/mods`, ".dm")
	.then((filenames) => Promise.resolve(filenames))
	.catch((err) => Promise.reject(err));
};

module.exports.getMapList = function()
{
	let mapsWithProvinceCount = [];

	return rw.getDirFilenames(config.dom5DataPath + "/maps", ".map")
	.then((filenames) =>
	{
		filenames.forEach((file) =>
		{
			let provs = provCountFn(file.content);

			if (provs != null)
			{
			  mapsWithProvinceCount.push({name: file.filename, ...provs});
			}
		});

		Promise.resolve(mapsWithProvinceCount);
	})
	.catch((err) => Promise.reject(err));
};

module.exports.getTurnFile = function(data)
{
    var gameName = data.name;
    var nationFilename = data.nationFilename;
    var path = `${config.dom5DataPath}/savedgames/${gameName}/${nationFilename}`;

    return readFileBuffer(path)
    .then((buffer) => Promise.resolve(buffer))
    .catch((err) => Promise.reject(err));
};

module.exports.getScoreFile = function(data)
{
    var gameName = data.name;
    var path = `${config.dom5DataPath}/savedgames/${gameName}/scores.html`;

    return readFileBuffer(path)
    .then((buffer) => Promise.resolve(buffer))
    .catch((err) => Promise.reject(err));
};

//Timer is received in ms but must be written in seconds in domcmd
module.exports.changeCurrentTimer = function(data)
{
    const gameName = data.name;
    const seconds = data.timer * 0.001;
    const domcmd = "settimeleft " + seconds;
    const path = `${config.dom5DataPath}/savedgames/${gameName}/domcmd`;

    return fsp.writeFile(path, domcmd)
	.then(() => Promise.resolve())
    .catch((err) => Promise.reject(err));
};

//Timer is received in ms but must be written in minutes in domcmd
module.exports.changeDefaultTimer = function(data)
{
    const gameName = data.name;
    const minutes = data.timer / 60000;
    var domcmd = "setinterval " + minutes;
    const path = `${config.dom5DataPath}/savedgames/${gameName}/domcmd`;

    //set currentTimer to what it was again, because setinterval changes the current timer as well
    if (data.currentTimer != null)
        domcmd += `\nsettimeleft ${data.currentTimer * 0.001}`;

    return fsp.writeFile(path, domcmd)
	.then(() => Promise.resolve())
    .catch((err) => Promise.reject(err));
};

//Set 60 seconds to start the game
module.exports.start = function(data)
{
    const gameName = data.name;
	const path = `${config.dom5DataPath}/savedgames/${gameName}/domcmd`;

	return fsp.writeFile(path, "settimeleft 60")
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
}

module.exports.restart = function(data)
{
    const gameName = data.name;
    const path = `${config.dom5DataPath}/savedgames/${gameName}`;
    const game = gameStore.getGame(data.port);

	rw.log("general", `Killing ${gameName}'s process...`);

	//kill game first so it doesn't automatically regenerate the statuspage file
	//as soon as it gets deleted
	return kill(game)
	.then(() => rw.atomicRmDir(path))
	.then(() => gameStore.requestHosting(game))
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.getSubmittedPretenders = function(data)
{
	return fetchStatusDump(data.name)
    .then((statusDumpWrapper) => Promise.resolve(statusDumpWrapper.getSubmittedPretenders()));
};

module.exports.removePretender = function(data)
{
	const gameName = data.name;
    var path = `${config.dom5DataPath}/savedgames/${gameName}/${data.nationFilename}`;
    
    if (/\.2h$/i.test(data.nationFilename) === false)
        path += ".2h";

	if (fs.existsSync(path) === false)
        return Promise.reject(new Error("Could not find the pretender file. Has it already been deleted? You can double-check in the lobby. If not, you can try rebooting the game."));

    return fsp.unlink(path)
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.getStales = function(data)
{
    var _lastHostedTime;

    return exports.getLastHostedTime(data.name)
    .then((lastHostedTime) =>
    {
        _lastHostedTime = lastHostedTime;
        return exports.getStatusDump(data);
    })
	.then((statusDumpWrapper) => statusDumpWrapper.fetchStales(_lastHostedTime))
	.then((stales) => Promise.resolve(stales));
};

module.exports.getStatusDump = function(data)
{
	return fetchStatusDump(data.name)
	.then((statusDumpWrapper) => Promise.resolve(statusDumpWrapper));
};

module.exports.backupSavefiles = function(data)
{
	var game = games[data.port];
	var source = `${config.dom5DataPath}/savedgames/${game.name}`;
	var target = `${config.dataFolderPath}/backups`;

	if (data.isNewTurn === true)
	{
		target += `${config.newTurnsBackupDirName}/${game.name}/Turn ${data.turnNbr}`;
	}

	else target += `${config.latestTurnBackupDirName}/${game.name}/Turn ${data.turnNbr}`;

	return rw.copyDir(source, target, false, ["", ".2h", ".trn"])
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.rollback = function(data)
{
	var game = games[data.port];
	var source = `${config.dataFolderPath}/backups/${config.latestTurnBackupDirName}/${game.name}/Turn ${data.turnNbr}`;
	var target = `${config.dom5DataPath}/savedgames/${game.name}`;

	if (fs.existsSync(source) === false)
	{
		source = `${config.dataFolderPath}/backups/${config.newTurnsBackupDirName}/${game.name}/Turn ${data.turnNbr}`;

		if (fs.existsSync(source) === false)
			return Promise.reject(new Error(`No backup of the previous turn was found to be able to rollback.`));
	}

	return rw.copyDir(source, target, false, ["", ".2h", ".trn"])
	.then(() => kill(game))
	.then(() => spawn(game))
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.deleteGameSavefiles = function(data)
{
	const gameName = data.name;
    const path = `${config.dom5DataPath}/savedgames/${gameName}`;
    const backupPath = `${config.dataFolderPath}/${gameName}`;

	return rw.deleteDir(path)
    .then(() => rw.deleteDir(backupPath))
    .then(() => 
    {
        console.log(`${game.name}: deleted the savedgames files and their backups.`);
        return Promise.resolve();
    })
	.catch((err) => Promise.reject(err));
};

module.exports.getLastHostedTime = function(gameName)
{
    const gameDataPath = `${config.dom5DataPath}/savedgames/${gameName}`;
    const ftherlndPath = `${gameDataPath}/ftherlnd`;

    return fsp.stat(ftherlndPath)
    .then((ftherlndStat) => Promise.resolve(ftherlndStat.mtime.getTime()));
};

module.exports.validateMapfile = function(mapfile)
{
	var dataPath = config.dom5DataPath;
	var rootPath = config.dom5RootPath;
	var mapfileRelPath = (/\.map$/i.test(mapfile) === false) ? `/maps/${mapfile}.map` : `/maps/${mapfile}`;

	if (typeof mapfile !== "string")
		return Promise.reject(new Error(`Invalid argument type provided; expected string path, got ${mapfile}`));

	if (fs.existsSync(`${dataPath}${mapfileRelPath}`) === true || fs.existsSync(`${rootPath}${mapfileRelPath}`) === true)
		return Promise.resolve();

	else Promise.reject(new Error("The map file could not be found."));
};

module.exports.validateMods = function(modfiles)
{
	var path = config.dom5DataPath;

	if (Array.isArray(modfiles) === false)
		return Promise.reject(new Error(`Invalid argument type provided; expected array of string paths, got ${modfiles}`));

	for (var i = 0; i < modfiles.length; i++)
	{
		var modfile = modfiles[i];

		if (typeof modfile !== "string")
			return Promise.reject(new Error(`Invalid modfiles element; expected path string, got ${modfile}`));

		if (fs.existsSync(`${path}/mods/${modfile}`) === false)
			return Promise.reject(new Error(`The mod file ${modfile} could not be found.`));
	}

	return Promise.resolve();
};