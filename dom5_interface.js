
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const configStore = require("./config_store.js");
const rw = require("./reader_writer.js");
const gameStore = require("./hosted_games_store.js");
const readFileBuffer = require("./read_file_buffer.js");
const gameStatusStore = require("./game_status_store.js");
const provCountFn = require("./dom5/parse_province_count.js");

const _savedGamesPath = `${configStore.dom5DataPath}/savedgames`;


module.exports.getModList = function()
{
	return rw.getDirFilenames(configStore.dom5ModsPath, ".dm")
	.then((filenames) => Promise.resolve(filenames))
	.catch((err) => Promise.reject(err));
};

module.exports.getMapList = async function()
{
	const mapsWithProvinceCount = [];
    const filenames = await fsp.readdir(configStore.dom5MapsPath);
    const mapFilenames = filenames.filter((filename) => path.extname(filename) === ".map");

    await mapFilenames.forAllPromises(async (filename) =>
    {
        const filePath = path.resolve(configStore.dom5MapsPath, filename);
        const content = await fsp.readFile(filePath, "utf-8");
        const provs = provCountFn(content);

        if (provs != null)
            mapsWithProvinceCount.push({name: filename, ...provs});
    });

    return mapsWithProvinceCount;
}

module.exports.getTurnFiles = async function(data)
{
    const gameName = data.name;
    const nationNames = data.nationNames;
    const gameFilesPath = path.resolve(_savedGamesPath, gameName);
    const scoresPath = path.resolve(gameFilesPath, "scores.html");
    const gameStatus = await gameStatusStore.fetchStatus(gameName);
    const files = { turnFiles: {} };

    const promises = nationNames.map(async (nationName) =>
    {
        const filepath = path.resolve(gameFilesPath, `${nationName}.trn`);
        const status = gameStatus.getNationStatus(nationName);

        // AI or dead nations won't have .trn files
        if (status.isHuman === false)
            return;

        if (fs.existsSync(filepath) === false)
            files.turnFiles[nationName] = "File does not exist?";

        files.turnFiles[nationName] = await readFileBuffer(filepath);
    });

    await Promise.allSettled(promises);


    if (fs.existsSync(scoresPath) === true)
        files.scores = await readFileBuffer(scoresPath);

    return files;
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
    const statusdump = await gameStatusStore.fetchStatus(data.name);
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

module.exports.hasStarted = function(gameName)
{
    const ftherlndPath = path.resolve(_savedGamesPath, gameName, "ftherlnd");

    if (fs.existsSync(ftherlndPath) === true)
        return true;

    else return false;
};

module.exports.restart = async function(data)
{
    const gameName = data.name;
    const deletePretenders = data.deletePretenders;
    const gameDirPath = path.resolve(_savedGamesPath, gameName);


	// kill game first so it doesn't automatically regenerate
	// the statuspage file as soon as it gets deleted
	log.general(log.getNormalLevel(), `Killing ${gameName}'s process...`);
    await gameStore.killGame(data.port);
    
    // Pretender files (.2h) that have orders submitted in the
    // current turn will NOT be kept as pretenders even if they
    // are not deleted by Dominions. It seems that Dominions only
    // considers "clean" .2h new turn files as pretender files
    if (deletePretenders !== true)
        await rw.keepOnlyFilesWithExt(gameDirPath, [".2h"]);

    else await rw.keepOnlyFilesWithExt(gameDirPath);


	await gameStore.requestHosting(data);
};

module.exports.getSubmittedPretender = async function(data)
{
	const status = await gameStatusStore.fetchStatus(data.name);
    var nations;
    var foundNation;

    if (status == null)
        return null;

    nations = status.getSubmittedPretenders();
    foundNation = nations.find((nation) =>
    {
        return data.identifier === nation.filename || +data.identifier === +nation.nationNbr;
    });

    return foundNation;
};

module.exports.getSubmittedPretenders = async function(data)
{
	const status = await gameStatusStore.fetchStatus(data.name);

    if (status == null)
        return null;

    return status.getSubmittedPretenders();
};

module.exports.removePretender = async function(data)
{
	const gameName = data.name;
    var filePath = path.resolve(_savedGamesPath, gameName, data.nationFilename);
    
    if (/\.2h$/i.test(data.nationFilename) === false)
        filePath += ".2h";

	if (fs.existsSync(filePath) === false)
        throw new Error("Could not find the pretender file. Has it already been deleted? You can double-check in the lobby. If not, you can try rebooting the game.");


    await fsp.unlink(filePath);
    await gameStatusStore.forceUpdate(gameName);
};

module.exports.getStales = function(data)
{
    const clonedStatusdumpPath = path.resolve(configStore.dom5DataPath, configStore.tmpFilesDirName, data.name);

	return gameStatusStore.fetchPreviousTurnStatus(data.name, clonedStatusdumpPath)
    .then((statusdumpWrapper) => 
    {
        if (statusdumpWrapper == null)
            return Promise.resolve(null);
        
        return statusdumpWrapper.fetchStales();
    });
};

module.exports.getUndoneTurns = async function(data)
{
    const status = await gameStatusStore.fetchStatus(data.name);

    if (status == null)
        return Promise.reject(`No undone turn data available for ${data.name}`);

	return status.getNationsWithUndoneTurns();
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
	const gameName = game.getName();
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
	.then(() => gameStore.killGame(data.port))
	.then(() => game.launchProcessWithRollbackedTurn())
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.deleteGameSavefiles = function(data)
{
	const gameName = data.name;
    const dirPath = path.resolve(_savedGamesPath, gameName);
    const backupPath = path.resolve(configStore.dataFolderPath, "backups", gameName);
    const logPath = path.resolve(configStore.dataFolderPath, "logs", "games", gameName);

	return rw.deleteDir(dirPath)
    .then(() => rw.deleteDir(backupPath))
    .then(() => 
    {
        log.general(log.getNormalLevel(), `${gameName}: deleted the savedgames files and their backups.`);

        // Delete log files, but don't block the resolution of the promise
        rw.deleteDir(logPath);
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
    const mapfileWithExtension = (/\.map$/i.test(mapfile) === false) ? `${mapfile}.map` : mapfile;
	const dataMapPath = path.resolve(configStore.dom5MapsPath, mapfileWithExtension);
	const rootMapPath = path.resolve(configStore.dom5RootPath, "maps", mapfileWithExtension);

	if (typeof mapfile !== "string")
		return Promise.reject(new Error(`Invalid argument type provided; expected string path, got ${mapfile}`));

	if (fs.existsSync(dataMapPath) === true || fs.existsSync(rootMapPath) === true)
		return Promise.resolve();

	else return Promise.reject(new Error(`The map file '${mapfileWithExtension}' could not be found.`));
};

module.exports.validateMods = function(modfiles)
{
	if (Array.isArray(modfiles) === false)
		return Promise.reject(new Error(`Invalid argument type provided; expected array of string paths, got ${modfiles}`));

	for (var i = 0; i < modfiles.length; i++)
	{
		const modfile = modfiles[i];
        const modfileWithExtension = (/\.dm$/i.test(modfile) === false) ? `${modfile}.dm` : modfile;
        const modPath = path.resolve(configStore.dom5ModsPath, modfileWithExtension);

		if (typeof modfile !== "string")
			return Promise.reject(new Error(`Invalid modfiles element; expected path string, got ${modfile}`));

		if (fs.existsSync(modPath) === false)
			return Promise.reject(new Error(`The mod file ${modfileWithExtension} could not be found.`));
	}

	return Promise.resolve();
};
