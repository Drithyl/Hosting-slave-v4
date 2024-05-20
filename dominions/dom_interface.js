
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("../logger.js");
const fileUtils = require("../utilities/file-utilities.js");
const gameStore = require("../stores/hosted_games_store.js");
const gameStatusStore = require("../stores/game_status_store.js");
const provCountFn = require("./parse_province_count.js");
const {
    getDominionsMapsPath,
    getDominionsModsPath,
    getDominionsSavedgamesPath,
    getDominionsMapExtension,
    getGamePostTurnBackupPath,
    getGamePreTurnBackupPath,
    getGameBackupPath,
    getGameLogPath,
} = require("../utilities/path-utilities.js");

module.exports.getModList = function(gameType)
{
	return fileUtils.getDirFilenames(getDominionsModsPath(gameType), ".dm")
	.then((filenames) => Promise.resolve(filenames))
	.catch((err) => Promise.reject(err));
};

module.exports.getMapList = async function(gameType)
{
	const mapsWithProvinceCount = [];
    const filenames = await fsp.readdir(getDominionsMapsPath(gameType));
    const mapFilenames = filenames.filter((filename) => path.extname(filename) === getDominionsMapExtension(gameType));

    await mapFilenames.forAllPromises(async (filename) =>
    {
        const filePath = path.resolve(getDominionsMapsPath(gameType), filename);
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
    const gameType = data.type;
    const nationNames = data.nationNames;
    const gameFilesPath = path.resolve(getDominionsSavedgamesPath(gameType), gameName);
    const scoresPath = path.resolve(gameFilesPath, "scores.html");
    const gameStatus = await gameStatusStore.fetchStatus(gameName, gameType);
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

        files.turnFiles[nationName] = await fileUtils.readFileBuffer(filepath);
    });

    await Promise.allSettled(promises);


    if (fs.existsSync(scoresPath) === true)
        files.scores = await fileUtils.readFileBuffer(scoresPath);

    return files;
};

module.exports.getTurnFile = function(data)
{
    const gameName = data.name;
    const nationFilename = data.nationFilename;
    const filePath = path.resolve(getDominionsSavedgamesPath(data.type), gameName, `${nationFilename}.trn`);

    return fileUtils.readFileBuffer(filePath)
    .then((buffer) => Promise.resolve(buffer))
    .catch((err) => Promise.reject(err));
};

module.exports.getScoreFile = function(data)
{
    const gameName = data.name;
    const filePath = path.resolve(getDominionsSavedgamesPath(data.type), gameName, "scores.html");

    return fileUtils.readFileBuffer(filePath)
    .then((buffer) => Promise.resolve(buffer))
    .catch((err) => Promise.reject(err));
};

// Timer is received in ms but must be written in seconds in domcmd
// for the current timer, and in minutes for the default timer
// Always changing both current and default timer is necessary
// to avoid unwanted default timers being set when games are loaded
module.exports.changeTimer = function(data)
{
    const gameName = data.name;
    const defaultTimer = +data.timer / 60000;
    const currentTimer = +data.currentTimer * 0.001;
    const domcmdPath = path.resolve(getDominionsSavedgamesPath(data.type), gameName, "domcmd");

    let timerArguments = "";

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
    const statusdump = await gameStatusStore.fetchStatus(data.name, data.type);
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

module.exports.hasStarted = function(gameName, gameType)
{
    const ftherlndPath = path.resolve(getDominionsSavedgamesPath(gameType), gameName, "ftherlnd");

    if (fs.existsSync(ftherlndPath) === true)
        return true;

    else return false;
};

module.exports.restart = async function(data)
{
    const gameName = data.name;
    const deletePretenders = data.deletePretenders;
    const gameDirPath = path.resolve(getDominionsSavedgamesPath(data.type), gameName);


	// Kill game first so it doesn't automatically regenerate
	// the statuspage file as soon as it gets deleted
	log.general(log.getNormalLevel(), `Killing ${gameName}'s process...`);
    await gameStore.killGame(data.port);
    
    // Pretender files (.2h) that have orders submitted in the
    // current turn will NOT be kept as pretenders even if they
    // are not deleted by Dominions. It seems that Dominions only
    // considers "clean" .2h new turn files as pretender files
    if (deletePretenders !== true)
        await fileUtils.keepOnlyFilesWithExt(gameDirPath, [".2h"]);

    else await fileUtils.keepOnlyFilesWithExt(gameDirPath);

    // Force a refresh of the game status and send it to the bot
    await module.exports.refresh(data);

    // Host the game again
	await gameStore.requestHosting(data);
};

module.exports.refresh = async function(data)
{
    const gameName = data.name;

	log.general(log.getNormalLevel(), `Refreshing ${gameName}'s status...`);
    await gameStatusStore.forceUpdate(data.name, data.type);
};

module.exports.getSubmittedPretender = async function(data)
{
	const status = await gameStatusStore.fetchStatus(data.name, data.type);
    let nations;
    let foundNation;

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
	const status = await gameStatusStore.fetchStatus(data.name, data.type);

    if (status == null)
        return null;

    return status.getSubmittedPretenders();
};

module.exports.removePretender = async function(data)
{
	const gameName = data.name;
    let filePath = path.resolve(getDominionsSavedgamesPath(data.type), gameName, data.nationFilename);
    
    if (/\.2h$/i.test(data.nationFilename) === false)
        filePath += ".2h";

	if (fs.existsSync(filePath) === false)
        throw new Error("Could not find the pretender file. Has it already been deleted? You can double-check in the lobby. If not, you can try rebooting the game.");


    await fsp.unlink(filePath);
    await gameStatusStore.forceUpdate(data.name, data.type);
};

module.exports.getStales = function(data)
{
	return gameStatusStore.fetchPreviousTurnStatus(data.name, data.type)
    .then((statusdumpWrapper) => 
    {
        if (statusdumpWrapper == null)
            return Promise.resolve(null);
        
        return statusdumpWrapper.fetchStales();
    });
};

module.exports.getUndoneTurns = async function(data)
{
    const status = await gameStatusStore.fetchStatus(data.name, data.type);

    if (status == null)
        return Promise.reject(`No undone turn data available for ${data.name}`);

	return status.getNationsWithUndoneTurns();
};

module.exports.backupSavefiles = function(gameData)
{
	const gameName = gameData.name;
	const source = path.resolve(getDominionsSavedgamesPath(gameData.type), gameName);
	let target;

	if (gameData.isNewTurn === true)
	    target = path.resolve(getGamePostTurnBackupPath(gameName), `t${gameData.turnNbr}`);

	else target = path.resolve(getGamePreTurnBackupPath(gameName), `t${gameData.turnNbr}`);

	return fsp.cp(source, target, { recursive: true, force: true, filter: (src, dest) => {
        return ["", ".2h", ".trn"].includes(path.extname(src));
    }})
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.rollback = function(data)
{
    const game = gameStore.getGame(data.port);
	const gameName = game.getName();
	const target = path.resolve(getDominionsSavedgamesPath(data.type), gameName);
	let source = path.resolve(getGamePreTurnBackupPath(gameName), `t${data.turnNbr}`);

	if (fs.existsSync(source) === false)
	{
        log.general(log.getNormalLevel(), `${gameName}: No pre-turn backup of turn ${data.turnNbr} was found at "${source}", looking for post-turn backups...`, source);
		source = path.resolve(getGamePostTurnBackupPath(gameName), `t${data.turnNbr}`);

		if (fs.existsSync(source) === false)
        {
            log.general(log.getLeanLevel(), `${gameName}: No backup of turn ${data.turnNbr} was found`, source);
            return Promise.reject(new Error(`No backup of the previous turn was found to be able to rollback.`));
        }
	}
    
    log.general(log.getNormalLevel(), `${gameName}: Copying backup of turn ${data.turnNbr} into into the game's savedgames...`, source);
    
    return fsp.cp(source, target, { recursive: true, force: true, filter: (src, dest) => {
        return ["", ".2h", ".trn"].includes(path.extname(src));
    }})
	.then(() => gameStore.killGame(data.port))
	.then(() => game.launchProcessWithRollbackedTurn())
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.deleteGameSavefiles = function(data)
{
	const gameName = data.name;

    if (gameName == null) {
        return Promise.reject(new Error(`Cannot delete game with undefined or null name!`));
    }

    const dirPath = path.resolve(getDominionsSavedgamesPath(data.type), gameName);
    const backupPath = getGameBackupPath(gameName);
    const logPath = getGameLogPath(gameName);

	return fsp.rm(dirPath, { recursive: true })
    .then(() => fsp.rm(backupPath, { recursive: true }))
    .then(() => 
    {
        log.general(log.getNormalLevel(), `${gameName}: deleted the savedgames files and their backups.`);

        // Delete log files, but don't block the resolution of the promise
        fsp.rm(logPath, { recursive: true });
        return Promise.resolve();
    })
	.catch((err) => Promise.reject(err));
};

module.exports.getLastHostedTime = function(data)
{
    const gameDataPath = path.resolve(getDominionsSavedgamesPath(data.type), data.name);
    const ftherlndPath = path.resolve(gameDataPath, "ftherlnd");

    return fsp.stat(ftherlndPath)
    .then((ftherlndStat) => Promise.resolve(ftherlndStat.mtime.getTime()));
};
