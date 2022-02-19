
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const assert = require("./asserter.js");
const configStore = require("./config_store.js");
const GameStatus = require("./dom5/game_status.js");
const socketWrapper = require("./socket_wrapper.js");
const gamesStore = require("./hosted_games_store.js");
const statusdumpFactory = require("./dom5/status_dump_wrapper.js");

const SAVEDGAMES_PATH = path.resolve(configStore.dom5DataPath, "savedgames");
const TEMP_FILES_PATH = path.resolve(configStore.dom5DataPath, configStore.tmpFilesDirName);
const STATUS_WRAPPERS_BY_NAME = {};
var _isUpdating = false;


module.exports.isUpdating = () => _isUpdating;

module.exports.populate = async () =>
{
    const gameNames = await fsp.readdir(SAVEDGAMES_PATH);

    return gameNames.forEachPromise(async (gameName, i, nextPromise) =>
    {
        log.general(log.getVerboseLevel(), `Fetching ${gameName}'s status...`);

        try
        {
            await _addStatus(gameName);
            log.general(log.getVerboseLevel(), `${gameName}'s status fetched!`);
            return nextPromise();
        }

        catch(err)
        {
            log.general(log.getVerboseLevel(), `${gameName}'s status could NOT be fetched!`, err);
            return nextPromise();
        }
    });
};

module.exports.addGame = async (gameObject) =>
{
    const gameName = gameObject.getName();

    if (_hasStatus(gameName) === false)
        await _addStatus(gameName);

    STATUS_WRAPPERS_BY_NAME[gameName].setGameObject(gameObject);
};

module.exports.fetchStatus = (gameName) =>
{
    if (_hasStatus(gameName) === true)
        return STATUS_WRAPPERS_BY_NAME[gameName].getStatusDump();

    else return Promise.resolve();
};

module.exports.consumeStatus = (gameName) =>
{
    if (_hasStatus(gameName) === true)
        return STATUS_WRAPPERS_BY_NAME[gameName].consumeStatusDump();

    else return Promise.resolve();
};

module.exports.forceUpdate = async (gameName) =>
{
    await _updateStatus(gameName);
};

module.exports.startUpdateCycle = () =>
{
    if (_isUpdating === true)
        return;

    _isUpdating = true;
    setTimeout(_statusUpdateCycle, configStore.updateInterval);
};

module.exports.updateGameCounterStatus = async (gameName) =>
{
    if (_hasStatus(gameName) === false)
        await _addStatus(gameName);
    
    if (_hasStatus(gameName) === true)
        STATUS_WRAPPERS_BY_NAME[gameName].updateCounterStatus();
};

module.exports.fetchPreviousTurnStatus = async (gameName) =>
{
    const clonedStatusdumpPath = path.resolve(TEMP_FILES_PATH, gameName);
    const wrapper = await statusdumpFactory.fetchStatusDump(gameName, clonedStatusdumpPath);
    return wrapper;
};

module.exports.sendStatusUpdateToMaster = (gameName) => 
{
    if (_hasStatus(gameName) === true)
        _sendStatusUpdateToMaster(STATUS_WRAPPERS_BY_NAME[gameName]);
};

function _hasStatus(gameName)
{
    return assert.isInstanceOfPrototype(STATUS_WRAPPERS_BY_NAME[gameName], GameStatus);
}

async function _addStatus(gameName)
{
    STATUS_WRAPPERS_BY_NAME[gameName] = new GameStatus(gameName);
    await STATUS_WRAPPERS_BY_NAME[gameName].updateStatus();
    return STATUS_WRAPPERS_BY_NAME[gameName];
}

async function _statusUpdateCycle()
{
    const startTime = Date.now();
    log.general(log.getNormalLevel(), "Starting game update cycle...");

    try
    {
        const gameNames = await fsp.readdir(SAVEDGAMES_PATH);
        await Promise.allSettled(gameNames.map(_updateStatus));
        log.general(log.getNormalLevel(), `Finished game update cycle in ${Date.now() - startTime}ms`);
        setTimeout(_statusUpdateCycle, configStore.updateInterval);
    }
    
    catch(err)
    {
        log.error(log.getNormalLevel(), `Error during game update cycle`, err);
        setTimeout(_statusUpdateCycle, configStore.updateInterval);
    }
};

async function _updateStatus(gameName)
{
    if (gamesStore.getGameByName(gameName) == null)
        return;

    if (_hasStatus(gameName) === false)
        STATUS_WRAPPERS_BY_NAME[gameName] = new GameStatus(gameName);

    
    await STATUS_WRAPPERS_BY_NAME[gameName].updateStatus();
    _sendStatusUpdateToMaster(STATUS_WRAPPERS_BY_NAME[gameName]);
}

function _sendStatusUpdateToMaster(gameStatus)
{
    socketWrapper.emit(
        "GAME_UPDATE", {
            gameName: gameStatus.getName(),
            isOnline: gameStatus.isOnline(),
            uptime: gameStatus.consumeUptime(),
            statusdump: gameStatus.getStatusDump()
        }
    );
}