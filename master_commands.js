
const log = require("./logger.js");
const dom5Interface = require("./dom5_interface.js");
const gameStatusStore = require("./game_status_store.js");
const hostedGamesStore = require("./hosted_games_store.js");
const reservedPortsStore = require("./reserved_ports_store.js");
const mapAndModsCleaner = require("./cleaners/unused_maps_and_mods_cleaner.js");

module.exports.listen = function(socketWrapper)
{
    socketWrapper.on("GAME_DATA", _populateGameData);

    socketWrapper.on("RESET_PORT", (gameData) => hostedGamesStore.resetPort(gameData));
    socketWrapper.on("RESERVE_PORT", (data) => reservedPortsStore.reservePort());
    socketWrapper.on("RELEASE_PORT", (data) => reservedPortsStore.releasePort(data.port));

    socketWrapper.on("VERIFY_MAP", (mapFilename) => dom5Interface.validateMapfile(mapFilename));
    socketWrapper.on("VERIFY_MODS", (modFilenames) => dom5Interface.validateMods(modFilenames));
    socketWrapper.on("DELETE_UNUSED_MAPS", (data) => mapAndModsCleaner.deleteUnusedMaps(data.mapsInUse, data.force));
    socketWrapper.on("DELETE_UNUSED_MODS", (data) => mapAndModsCleaner.deleteUnusedMods(data.modsInUse, data.force));

    socketWrapper.on("ONLINE_CHECK", (port) => Promise.resolve(hostedGamesStore.isGameOnline(port)));

    socketWrapper.on("IS_GAME_NAME_FREE", (data) => hostedGamesStore.isGameNameUsed(data.name));
    socketWrapper.on("CREATE_GAME", (data) => hostedGamesStore.create(data.name, data.port, data.gameType, data.args));
    socketWrapper.on("DELETE_FTHERLND", (data) => hostedGamesStore.deleteFtherlndFile(data));
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
    socketWrapper.on("GET_STATUS_DUMP", (data) => gameStatusStore.fetchStatus(data.name));
    socketWrapper.on("CONSUME_STATUS_DUMP", (data) => gameStatusStore.consumeStatus(data.name));
    socketWrapper.on("OVERWRITE_SETTINGS", (data) => hostedGamesStore.overwriteSettings(data));
    socketWrapper.on("START_GAME", (data) => dom5Interface.start(data));
    socketWrapper.on("RESTART_GAME", (data) => dom5Interface.restart(data));
    socketWrapper.on("BACKUP_SAVEFILES", (data) => dom5Interface.backupSavefiles(data));
    socketWrapper.on("ROLLBACK", (data) => dom5Interface.rollback(data));
    socketWrapper.on("REMOVE_NATION", (data) => dom5Interface.removePretender(data));
};

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
