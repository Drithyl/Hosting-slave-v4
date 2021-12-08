
const log = require("./logger.js");
const configStore = require("./config_store.js");
const downloader = require("./file_downloader.js");
const dom5Interface = require("./dom5_interface.js");
const hostedGamesStore = require("./hosted_games_store.js");
const reservedPortsStore = require("./reserved_ports_store.js");
const unusedFilesCleaner = require("./unused_files_cleaner.js");

module.exports.listen = function(socketWrapper)
{
    socketWrapper.on("REQUEST_SERVER_DATA", _sendServerData);
    socketWrapper.on("GAME_DATA", _populateGameData);
    socketWrapper.on("UPLOAD_FILE", _downloadFile);

    socketWrapper.on("RESET_PORT", (gameData) => hostedGamesStore.resetPort(gameData));
    socketWrapper.on("RESERVE_PORT", (data) => reservedPortsStore.reservePort());
    socketWrapper.on("RELEASE_PORT", (data) => reservedPortsStore.releasePort(data.port));

    socketWrapper.on("VERIFY_MAP", (mapFilename) => dom5Interface.validateMapfile(mapFilename));
    socketWrapper.on("VERIFY_MODS", (modFilenames) => dom5Interface.validateMods(modFilenames));
    socketWrapper.on("DELETE_UNUSED_MAPS", (mapsInUse) => unusedFilesCleaner.deleteUnusedMaps(mapsInUse));
    socketWrapper.on("DELETE_UNUSED_MODS", (modsInUse) => unusedFilesCleaner.deleteUnusedMods(modsInUse));

    socketWrapper.on("ONLINE_CHECK", (port) => Promise.resolve(hostedGamesStore.isGameOnline(port)));

    socketWrapper.on("IS_GAME_NAME_FREE", (data) => hostedGamesStore.isGameNameUsed(data.name));
    socketWrapper.on("CREATE_GAME", (data) => hostedGamesStore.create(data.name, data.port, data.gameType, data.args));
    socketWrapper.on("DELETE_GAME", (data) => hostedGamesStore.deleteGame(data));
    socketWrapper.on("LAUNCH_GAME", (gameData) => hostedGamesStore.requestHosting(gameData));
    socketWrapper.on("KILL_GAME", (gameData) => hostedGamesStore.killGame(gameData.port));
    socketWrapper.on("CHANGE_TIMER", (data) => dom5Interface.changeTimer(data));
    socketWrapper.on("FORCE_HOST", (data) => dom5Interface.forceHost(data));
    socketWrapper.on("GET_LAST_HOSTED_TIME", (data) => dom5Interface.getLastHostedTime(data));
    socketWrapper.on("GET_MOD_LIST", (data) => dom5Interface.getModList());
    socketWrapper.on("GET_MAP_LIST", (data) => dom5Interface.getMapList());
    socketWrapper.on("GET_TURN_FILES", (data) => dom5Interface.getTurnFiles(data));
    socketWrapper.on("GET_TURN_FILE", (data) => dom5Interface.getTurnFile(data));
    socketWrapper.on("GET_SCORE_DUMP", (data) => dom5Interface.getScoreFile(data));
    socketWrapper.on("GET_STALES", (data) => dom5Interface.getStales(data));
    socketWrapper.on("GET_UNDONE_TURNS", (data) => dom5Interface.getUndoneTurns(data));
    socketWrapper.on("GET_SUBMITTED_PRETENDER", (data) => dom5Interface.getSubmittedPretender(data));
    socketWrapper.on("GET_SUBMITTED_PRETENDERS", (data) => dom5Interface.getSubmittedPretenders(data));
    socketWrapper.on("GET_STATUS_DUMP", (data) => dom5Interface.getStatusDump(data));
    socketWrapper.on("OVERWRITE_SETTINGS", (data) => hostedGamesStore.overwriteSettings(data));
    socketWrapper.on("START_GAME", (data) => dom5Interface.start(data));
    socketWrapper.on("RESTART_GAME", (data) => dom5Interface.restart(data));
    socketWrapper.on("BACKUP_SAVEFILES", (data) => dom5Interface.backupSavefiles(data));
    socketWrapper.on("ROLLBACK", (data) => dom5Interface.rollback(data));
    socketWrapper.on("REMOVE_NATION", (data) => dom5Interface.removePretender(data));
};

/************************************
*   MASTER SERVER AUTHENTICATION    *
************************************/
//This is called by the master server once it receives the socket connection,
//to verify that this server is trusted by using the token.
function _sendServerData(data)
{
    log.general(log.getLeanLevel(), "Received REQUEST_SERVER_DATA event from master server. Sending authentication attempt.");
    
    return Promise.resolve({
        id: configStore.id, 
        capacity: configStore.capacity, 
        ownerDiscordID: configStore.ownerDiscordID
    });
}

//Received when the master server validates the authentication,
//at which point we can launch games.
function _populateGameData(gamesInfo)
{
	log.general(log.getLeanLevel(), "Authentication attempt validated by master server; received game data to host.");

	if (typeof gamesInfo !== "object")
	{
	  log.error(log.getLeanLevel(), `NO GAME DATA RECEIVED FROM MASTER SERVER`, gamesInfo);
	  return hostedGamesStore.populate({});
	}

	else return hostedGamesStore.populate(gamesInfo);
}

function _downloadFile(data)
{
	if (typeof data.fileId !== "string")
	  return Promise.reject(new Error("fileId must be specified."));

    log.upload(log.getLeanLevel(), `Request to download ${data.type} zipfile ${data.fileId} received.`);

    return Promise.resolve()
    .then(() =>
    {
        if (/^map$/i.test(data.type) === true)
            return downloader.downloadMap(data.fileId);

        else if (/^mod$/i.test(data.type) === true)
            return downloader.downloadMod(data.fileId);

        else return Promise.reject(new Error("type must be 'map' or 'mod'"));
    });
}