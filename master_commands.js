
const config = require("./config.json");
const rw = require("./reader_writer.js");
const downloader = require("./file_downloader.js");
const dom5Interface = require("./dom5_interface.js");
const hostedGamesStore = require("./hosted_games_store.js");
const reservedPortsStore = require("./reserved_ports_store.js");

module.exports.listen = function(socketWrapper)
{
    socketWrapper.on("REQUEST_SERVER_DATA", _sendServerData);
    socketWrapper.on("GAME_DATA", _populateGameData);
    socketWrapper.on("DOWNLOAD_MAP", _downloadMap);
    socketWrapper.on("DOWNLOAD_MOD", _downloadMod);

    socketWrapper.on("RESERVE_PORT", (data) => reservedPortsStore.reservePort());
    socketWrapper.on("RELEASE_PORT", (data) => reservedPortsStore.releasePort(data.port));

    socketWrapper.on("VERIFY_MAP", (mapFilename) => dom5Interface.validateMapfile(mapFilename));
    socketWrapper.on("VERIFY_MODS", (modFilenames) => dom5Interface.validateMods(modFilenames));

    socketWrapper.on("ONLINE_CHECK", (port) => Promise.resolve(hostedGamesStore.isGameOnline(port)));

    socketWrapper.on("IS_GAME_NAME_FREE", (data) => hostedGamesStore.isGameNameUsed(data.name));
    socketWrapper.on("CREATE_GAME", (data) => hostedGamesStore.create(data.name, data.port, data.gameType, data.args));
    socketWrapper.on("DELETE_GAME_SAVEFILES", (data) => hostedGamesStore.deleteGameSavefiles(data));
    socketWrapper.on("DELETE_GAME_DATA", (data) => hostedGamesStore.deleteGameData(data));
    socketWrapper.on("LAUNCH_GAME", (gameData) => hostedGamesStore.requestHosting(gameData));
    socketWrapper.on("KILL_GAME", (gameData) => hostedGamesStore.killGame(gameData.port));
    socketWrapper.on("GET_LAST_HOSTED_TIME", (data) => dom5Interface.getLastHostedTime(data));
    socketWrapper.on("GET_MOD_LIST", (data) => dom5Interface.getModList());
    socketWrapper.on("GET_MAP_LIST", (data) => dom5Interface.getMapList());
    socketWrapper.on("GET_TURN_FILE", (data) => dom5Interface.getTurnFile(data));
    socketWrapper.on("GET_SCORE_DUMP", (data) => dom5Interface.getScoreDump(data));
    socketWrapper.on("GET_STALES", (data) => dom5Interface.getStales(data));
    socketWrapper.on("GET_SUBMITTED_PRETENDERS", (data) => dom5Interface.getSubmittedPretenders(data));
    socketWrapper.on("GET_STATUS_DUMP", (data) => dom5Interface.getStatusDump(data));
    socketWrapper.on("OVERWRITE_SETTINGS", (data) => hostedGamesStore.overwriteSettings(data));
    socketWrapper.on("START_GAME", (data) => dom5Interface.start(data));
    socketWrapper.on("RESTART_GAME", (data) => dom5Interface.restart(data));
    socketWrapper.on("BACKUP_SAVEFILES", (data) => dom5Interface.backupSavefiles(data));
    socketWrapper.on("ROLLBACK", (data) => dom5Interface.rollback(data));
    socketWrapper.on("REMOVE_PRETENDER", (data) => dom5Interface.removePretender(data));
};

/************************************
*   MASTER SERVER AUTHENTICATION    *
************************************/
//This is called by the master server once it receives the socket connection,
//to verify that this server is trusted by using the token.
function _sendServerData(data)
{
    rw.log("general", "Received REQUEST_SERVER_DATA event from master server. Sending authentication attempt.");
    
    return Promise.resolve({
        id: config.id, 
        capacity: config.capacity, 
        ownerDiscordID: config.ownerDiscordID
    });
}

//Received when the master server validates the authentication,
//at which point we can launch games.
function _populateGameData(gamesInfo)
{
	rw.log("general", "Authentication attempt validated by master server; received game data to host.");

	if (typeof gamesInfo !== "object")
	{
	  rw.log("error", `Did not receive any game data from master server:`, gamesInfo);
	  return hostedGamesStore.populate({});
	}

	else return hostedGamesStore.populate(gamesInfo);
}

function _downloadMap(data)
{
	if (typeof data.fileId !== "string")
	  return Promise.reject(new Error("fileId must be specified."));

    rw.log("upload", `Request to download map zipfile ${data.fileId} received.`);
    
	//confirm that request is valid
	Promise.resolve();

	return downloader.downloadMap(data.fileId)
    .then((filesWritten) => 
    {
        //Do not return this .emit() promise as it will interfere with the Promise chain
        //and no further action is needed after emitting the result to master server
        socketWrapper.emit("DOWNLOAD_COMPLETE", filesWritten);
    })
    .catch((err) => socketWrapper.emit("DOWNLOAD_ERROR", err.message));
}

function _downloadMod(data)
{
	if (typeof data.fileId !== "string")
	  return Promise.reject(new Error("fileId must be specified."));

	//confirm that request is valid
	Promise.resolve();

	rw.log("upload", `Request to download mod zipfile ${data.fileId} received.`);

	return downloader.downloadMod(data.fileId)
    .then((filesWritten) => 
    {
        //Do not return this .emit() promise as it will interfere with the Promise chain
        //and no further action is needed after emitting the result to master server
        socketWrapper.emit("DOWNLOAD_COMPLETE", filesWritten);
    })
    .catch((err) => socketWrapper.emit("DOWNLOAD_ERROR", err.message));
}