
const log = require("./logger.js");
const domInterface = require("./dom_interface.js");
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

    socketWrapper.on("VERIFY_MAP", (data) => domInterface.validateMapfile(data));
    socketWrapper.on("VERIFY_MODS", (data) => domInterface.validateMods(data));
    socketWrapper.on("DELETE_UNUSED_MAPS", (data) => mapAndModsCleaner.deleteUnusedMaps(data.mapsInUse, data.type, data.force));
    socketWrapper.on("DELETE_UNUSED_MODS", (data) => mapAndModsCleaner.deleteUnusedMods(data.modsInUse, data.type, data.force));

    socketWrapper.on("ONLINE_CHECK", (port) => Promise.resolve(hostedGamesStore.isGameOnline(port)));

    socketWrapper.on("IS_GAME_NAME_FREE", (data) => hostedGamesStore.isGameNameUsed(data.name));
    socketWrapper.on("CREATE_GAME", (data) => hostedGamesStore.create(data.name, data.port, data.gameType, data.args));
    socketWrapper.on("DELETE_FTHERLND", (data) => hostedGamesStore.deleteFtherlndFile(data));
    socketWrapper.on("DELETE_GAME", (data) => hostedGamesStore.deleteGame(data));
    socketWrapper.on("LAUNCH_GAME", (gameData) => hostedGamesStore.requestHosting(gameData));
    socketWrapper.on("KILL_GAME", (gameData) => hostedGamesStore.killGame(gameData.port));
    socketWrapper.on("CHANGE_TIMER", (data) => domInterface.changeTimer(data));
    socketWrapper.on("FORCE_HOST", (data) => domInterface.forceHost(data));
    socketWrapper.on("GET_LAST_HOSTED_TIME", (data) => domInterface.getLastHostedTime(data));
    socketWrapper.on("GET_MOD_LIST", (gameType) => domInterface.getModList(gameType));
    socketWrapper.on("GET_MAP_LIST", (gameType) => domInterface.getMapList(gameType));
    socketWrapper.on("GET_TURN_FILES", (data) => domInterface.getTurnFiles(data));
    socketWrapper.on("GET_TURN_FILE", (data) => domInterface.getTurnFile(data));
    socketWrapper.on("GET_SCORE_DUMP", (data) => domInterface.getScoreFile(data));
    socketWrapper.on("GET_STALES", (data) => domInterface.getStales(data));
    socketWrapper.on("GET_UNDONE_TURNS", (data) => domInterface.getUndoneTurns(data));
    socketWrapper.on("GET_SUBMITTED_PRETENDER", (data) => domInterface.getSubmittedPretender(data));
    socketWrapper.on("GET_SUBMITTED_PRETENDERS", (data) => domInterface.getSubmittedPretenders(data));
    socketWrapper.on("GET_STATUS_DUMP", (data) => gameStatusStore.fetchStatus(data.name, data.type));
    socketWrapper.on("CONSUME_STATUS_DUMP", (data) => gameStatusStore.consumeStatus(data));
    socketWrapper.on("OVERWRITE_SETTINGS", (data) => hostedGamesStore.overwriteSettings(data));
    socketWrapper.on("START_GAME", (data) => domInterface.start(data));
    socketWrapper.on("RESTART_GAME", (data) => domInterface.restart(data));
    socketWrapper.on("REFRESH_GAME", (data) => domInterface.refresh(data));
    socketWrapper.on("BACKUP_SAVEFILES", (data) => domInterface.backupSavefiles(data));
    socketWrapper.on("ROLLBACK", (data) => domInterface.rollback(data));
    socketWrapper.on("REMOVE_NATION", (data) => domInterface.removePretender(data));
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
