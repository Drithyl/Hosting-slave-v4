
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const configStore = require("./config_store.js");
const rw = require("./reader_writer.js");
const spawn = require("./process_spawn.js").spawn;
const gameStore = require("./hosted_games_store.js");
const readFileBuffer = require("./read_file_buffer.js");
const provCountFn = require("./dom5/parse_province_count.js");
const { fetchStatusDump } = require("./dom5/status_dump_wrapper.js");

const _savedGamesPath = `${configStore.dom5DataPath}/savedgames`;


module.exports.getModList = function()
{
	return rw.getDirFilenames(configStore.dom5ModsPath, ".dm")
	.then((filenames) => Promise.resolve(filenames))
	.catch((err) => Promise.reject(err));
};

module.exports.getMapList = function()
{
	const mapsWithProvinceCount = [];

	return rw.readDirContents(configStore.dom5MapsPath, ".map")
	.then((filesContentsByName) =>
	{
		filesContentsByName.forEachItem((content, filename) =>
		{
			const provs = provCountFn(content);

			if (provs != null)
			    mapsWithProvinceCount.push({name: filename, ...provs});
		});

		return Promise.resolve(mapsWithProvinceCount);
	})
	.catch((err) => Promise.reject(err));
};

module.exports.getTurnFiles = function(data)
{
    const gameName = data.name;
    const nationNames = data.nationNames;
    const gameFilesPath = path.resolve(_savedGamesPath, gameName);
    const scoresPath = path.resolve(gameFilesPath, "scores.html");
    const files = { turnFiles: {} };

    return nationNames.forAllPromises((nationName) =>
    {
        return readFileBuffer(path.resolve(gameFilesPath, `${nationName}.trn`))
        .then((buffer) => files.turnFiles[nationName] = buffer)
        .catch((err) => Promise.reject(err));
    })
    .then(() => 
    {
        if (fs.existsSync(scoresPath) === false)
            return Promise.resolve();

        return readFileBuffer(scoresPath)
        .then((buffer) =>
        {
            files.scores = buffer;
            return Promise.resolve(files);
        });
    })
    .catch((err) => 
    {
        log.error(log.getLeanLevel(), `ERROR GETTING TURN FILES FOR ${gameName}`, err);
        return Promise.reject(err);
    });
};

module.exports.getTurnFile = function(data)
{
    const gameName = data.name;
    const nationFilename = data.nationFilename;
    const filePath = path.resolve(_savedGamesPath, gameName, `${nationFilename}.trn`);

    return readFileBuffer(filePath)
    .then((buffer) => Promise.resolve(buffer))
    .catch((err) => Promise.reject(err));
};

module.exports.getScoreFile = function(data)
{
    const gameName = data.name;
    const filePath = path.resolve(_savedGamesPath, gameName, "scores.html");

    return readFileBuffer(filePath)
    .then((buffer) => Promise.resolve(buffer))
    .catch((err) => Promise.reject(err));
};

//Timer is received in ms but must be written in seconds in domcmd
//for the current timer, and in minutes for the default timer
//Always changing both current and default timer is necessary
//to avoid unwanted default timers being set when games are loaded
module.exports.changeTimer = function(data)
{
    const gameName = data.name;
    const defaultTimer = +data.timer / 60000;
    const currentTimer = +data.currentTimer * 0.001;
    const domcmdPath = path.resolve(_savedGamesPath, gameName, "domcmd");

    var timerArguments = "";

    if (isNaN(defaultTimer) === false)
        timerArguments += `setinterval ${defaultTimer}\n`;

    if (isNaN(currentTimer) === false)
        timerArguments += `settimeleft ${currentTimer}\n`;

    return fsp.writeFile(domcmdPath, timerArguments)
	.then(() => Promise.resolve())
    .catch((err) => Promise.reject(err));
};

module.exports.forceHost = function(data)
{
    // Change current timer to 5 seconds, which will make the start countdown begin;
    // while reinforcing the default timer once again (important in case this is a 
    // start after a restart, we don't want to keep old values)
    const forceHostData = Object.assign(data, { timer: data.timer, currentTimer: 5000 });

	return exports.changeTimer(forceHostData)
	.then(() => Promise.resolve())
    .catch((err) => Promise.reject(err));
};

//Set 60 seconds to start the game
module.exports.start = async function(data)
{
    // Change current timer to 6 seconds, which will make the start countdown begin;
    // while reinforcing the default timer once again (important in case this is a 
    // start after a restart, we don't want to keep old values)
    const startData = Object.assign(data, { timer: data.timer, currentTimer: 6000 });
    const statusdump = await fetchStatusDump(data.name);
    const submittedPretenders = statusdump.getSubmittedPretenders();

    if (statusdump.hasSelectedNations() === false)
        return Promise.reject(new Error(`Cannot start a game with no submitted pretenders.`));

    // Checks if at least one nation is human
    if (submittedPretenders.length < 2)
        return Promise.reject(new Error(`At least two nations must be human-controlled.`));

	return exports.changeTimer(startData)
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.hasStarted = function(data)
{
    const gameName = data.name;
    const ftherlndPath = path.resolve(_savedGamesPath, gameName, "ftherlnd");

    if (fs.existsSync(ftherlndPath) === true)
        return true;

    else return false;
};

module.exports.restart = function(data)
{
    const gameName = data.name;
    const gameDirPath = path.resolve(_savedGamesPath, gameName);

	log.general(log.getNormalLevel(), `Killing ${gameName}'s process...`);

	//kill game first so it doesn't automatically regenerate the statuspage file
	//as soon as it gets deleted
	return gameStore.killGame(data.port)
	.then(() => rw.atomicRmDir(gameDirPath))
	.then(() => gameStore.requestHosting(data))
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
    var filePath = path.resolve(_savedGamesPath, gameName, data.nationFilename);
    
    if (/\.2h$/i.test(data.nationFilename) === false)
        filePath += ".2h";

	if (fs.existsSync(filePath) === false)
        return Promise.reject(new Error("Could not find the pretender file. Has it already been deleted? You can double-check in the lobby. If not, you can try rebooting the game."));

    return fsp.unlink(filePath)
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.getStales = function(data)
{
    const clonedStatusdumpPath = `${configStore.dom5DataPath}/${configStore.tmpFilesDirName}/${data.name}`;

	return fetchStatusDump(data.name, clonedStatusdumpPath)
    .then((statusDumpWrapper) => statusDumpWrapper.fetchStales());
};

module.exports.getUndoneTurns = function(data)
{
	return fetchStatusDump(data.name)
    .then((statusDumpWrapper) => Promise.resolve(statusDumpWrapper.getNationsWithUndoneTurns()));
};

module.exports.backupSavefiles = function(gameData)
{
	const gameName = gameData.name;
	const source = path.resolve(_savedGamesPath, gameName);
	var target = path.resolve(configStore.dataFolderPath, "backups");

	if (gameData.isNewTurn === true)
	    target = path.resolve(target, configStore.newTurnsBackupDirName, gameName, `Turn ${gameData.turnNbr}`);

	else target = path.resolve(target, configStore.preHostTurnBackupDirName, gameName, `Turn ${gameData.turnNbr}`);

	return rw.copyDir(source, target, false, ["", ".2h", ".trn"])
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.rollback = function(data)
{
    const game = gameStore.getGame(data.port);
	const gameName = game.name;
	const target = path.resolve(_savedGamesPath, gameName);
	var source = path.resolve(configStore.dataFolderPath, "backups", gameName, configStore.preHostTurnBackupDirName, `Turn ${data.turnNbr}`);

	if (fs.existsSync(source) === false)
	{
        log.general(log.getNormalLevel(), `${gameName}: No backup of turn ${data.turnNbr} was found in ${configStore.preHostTurnBackupDirName}, looking in new turns...`, source);
    
		source = path.resolve(configStore.dataFolderPath, "backups", gameName, configStore.newTurnsBackupDirName, `Turn ${data.turnNbr}`);

		if (fs.existsSync(source) === false)
        {
            log.general(log.getLeanLevel(), `${gameName}: No backup of turn ${data.turnNbr} was found`, source);
            return Promise.reject(new Error(`No backup of the previous turn was found to be able to rollback.`));
        }
	}
    
    log.general(log.getNormalLevel(), `${gameName}: Copying backup of turn ${data.turnNbr} into into the game's savedgames...`, source);

	return rw.copyDir(source, target, false, ["", ".2h", ".trn"])
	.then(() => gameStore.killGame(game.port))
	.then(() => spawn(game))
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.deleteGameSavefiles = function(data)
{
	const gameName = data.name;
    const dirPath = path.resolve(_savedGamesPath, gameName);
    const backupPath = path.resolve(configStore.dataFolderPath, "backups", gameName);

	return rw.deleteDir(dirPath)
    .then(() => rw.deleteDir(backupPath))
    .then(() => 
    {
        log.general(log.getNormalLevel(), `${gameName}: deleted the savedgames files and their backups.`);
        return Promise.resolve();
    })
	.catch((err) => Promise.reject(err));
};

module.exports.getLastHostedTime = function(gameName)
{
    const gameDataPath = path.resolve(_savedGamesPath, gameName);
    const ftherlndPath = path.resolve(gameDataPath, "ftherlnd");

    return fsp.stat(ftherlndPath)
    .then((ftherlndStat) => Promise.resolve(ftherlndStat.mtime.getTime()));
};

module.exports.validateMapfile = function(mapfile)
{
	var dataPath = configStore.dom5DataPath;
	var rootPath = configStore.dom5RootPath;
	var mapfileRelPath = (/\.map$/i.test(mapfile) === false) ? `/maps/${mapfile}.map` : `/maps/${mapfile}`;

	if (typeof mapfile !== "string")
		return Promise.reject(new Error(`Invalid argument type provided; expected string path, got ${mapfile}`));

	if (fs.existsSync(`${dataPath}${mapfileRelPath}`) === true || fs.existsSync(`${rootPath}${mapfileRelPath}`) === true)
		return Promise.resolve();

	else return Promise.reject(new Error(`The map file '${mapfile}' could not be found.`));
};

module.exports.validateMods = function(modfiles)
{
	var dataPath = configStore.dom5DataPath;

	if (Array.isArray(modfiles) === false)
		return Promise.reject(new Error(`Invalid argument type provided; expected array of string paths, got ${modfiles}`));

	for (var i = 0; i < modfiles.length; i++)
	{
		var modfile = modfiles[i];
        var modfileRelPath = (/\.dm$/i.test(modfile) === false) ? `/mods/${modfile}.dm` : `/mods/${modfile}`;

		if (typeof modfile !== "string")
			return Promise.reject(new Error(`Invalid modfiles element; expected path string, got ${modfile}`));

		if (fs.existsSync(`${dataPath}${modfileRelPath}`) === false)
			return Promise.reject(new Error(`The mod file ${modfile} could not be found.`));
	}

	return Promise.resolve();
};
