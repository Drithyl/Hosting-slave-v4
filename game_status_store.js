
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const assert = require("./asserter.js");
const configStore = require("./config_store.js");
const GameStatus = require("./dom/game_status.js");
const socketWrapper = require("./socket_wrapper.js");
const gamesStore = require("./hosted_games_store.js");
const { getDominionsSavedgamesPath, getSlaveTmpPath } = require('./helper_functions.js');
const statusdumpFactory = require("./dom/status_dump_wrapper.js");

const DOM5_SAVEDGAMES_PATH = getDominionsSavedgamesPath(configStore.dom5GameTypeName);
const DOM6_SAVEDGAMES_PATH = getDominionsSavedgamesPath(configStore.dom6GameTypeName);

const DOM5_STATUS_WRAPPERS = {};
const DOM6_STATUS_WRAPPERS = {};

var _isUpdating = false;


module.exports.isUpdating = () => _isUpdating;

module.exports.populate = async () =>
{
    const games = await _readAllDominionsGames();
    return games.forEachPromise(async ({name, gameType}, i, nextPromise) =>
    {
        log.general(log.getVerboseLevel(), `Fetching ${name}'s (${gameType}) status...`);

        try
        {
            await _addStatus(name, gameType);
            log.general(log.getVerboseLevel(), `${name}'s (${gameType}) status fetched!`);
            return nextPromise();
        }

        catch(err)
        {
            log.general(log.getVerboseLevel(), `${name}'s (${gameType}) status could NOT be fetched!`, err);
            return nextPromise();
        }
    });
};

module.exports.addGame = async (gameObject) =>
{
    const gameName = gameObject.getName();
    const gameType = gameObject.getType();

    if (_hasStatus(gameName, gameType) === false)
        await _addStatus(gameName, gameType);

    _getWrappersByGameType(gameType)[gameName].setGameObject(gameObject);
};

module.exports.removeGame = (gameName, gameType) =>
{
    if (_hasStatus(gameName, gameType) === false)
        return;

    delete _getWrappersByGameType(gameType)[gameName];
};

module.exports.fetchStatus = (gameName, gameType) =>
{
    if (_hasStatus(gameName, gameType) === true)
        return _getWrappersByGameType(gameType)[gameName].getStatusDump();

    else return Promise.resolve();
};

module.exports.consumeStatus = (gameData) =>
{
    if (_hasStatus(gameData.name, gameData.type) === true)
        return _getWrappersByGameType(gameData.type).consumeStatusDump();

    else return Promise.resolve();
};

module.exports.forceUpdate = async (gameName, gameType) =>
{
    await _updateStatus(gameName, gameType);
};

module.exports.startUpdateCycle = () =>
{
    if (_isUpdating === true)
        return;

    _isUpdating = true;
    setTimeout(_statusUpdateCycle, configStore.updateInterval);
};

module.exports.updateGameCounterStatus = async (gameName, gameType) =>
{
    if (_hasStatus(gameName, gameType) === false)
        await _addStatus(gameName, gameType);
    
    if (_hasStatus(gameName, gameType) === true)
        _getWrappersByGameType(gameType)[gameName].updateCounterStatus();
};

module.exports.fetchPreviousTurnStatus = async (gameName, gameType) =>
{
    const clonedStatusdumpPath = path.resolve(getSlaveTmpPath(), gameName);
    const wrapper = await statusdumpFactory.fetchStatusDump(gameName, gameType, clonedStatusdumpPath);
    return wrapper;
};

module.exports.sendStatusUpdateToMaster = (gameName, gameType) => 
{
    if (_hasStatus(gameName, gameType) === true)
        _sendStatusUpdateToMaster(_getWrappersByGameType(gameType)[gameName]);
};

function _hasStatus(gameName, gameType)
{
    return assert.isInstanceOfPrototype(_getWrappersByGameType(gameType)[gameName], GameStatus);
}

async function _addStatus(gameName, gameType)
{
    const gameStatus = new GameStatus(gameName, gameType);
    const statusWrappers = _getWrappersByGameType(gameType);
    statusWrappers[gameName] = gameStatus;
    await gameStatus.updateStatus();
    return gameStatus;
}

async function _statusUpdateCycle()
{
    const startTime = Date.now();
    log.general(log.getNormalLevel(), "Starting game update cycle...");

    try
    {
        const games = await _readAllDominionsGames();
        await Promise.allSettled(games.map((game) => _updateStatus(game.name, game.gameType)));
        log.general(log.getNormalLevel(), `Finished game update cycle in ${Date.now() - startTime}ms`);
        setTimeout(_statusUpdateCycle, configStore.updateInterval);
    }
    
    catch(err)
    {
        log.error(log.getNormalLevel(), `Error during game update cycle`, err);
        setTimeout(_statusUpdateCycle, configStore.updateInterval);
    }
};

async function _updateStatus(name, gameType)
{
    const statusWrappers = _getWrappersByGameType(gameType);

    if (gamesStore.getGameByName(name, gameType) == null)
        return;

    if (_hasStatus(name, gameType) === false)
        await _addStatus(name, gameType);

    else statusWrappers[name].updateStatus();

    _sendStatusUpdateToMaster(statusWrappers[name], gameType);
}

function _sendStatusUpdateToMaster(gameStatus, gameType)
{
    socketWrapper.emit(
        "GAME_UPDATE", {
            gameName: gameStatus.getName(),
            type: gameType,
            isOnline: gameStatus.isOnline(),
            uptime: gameStatus.consumeUptime(),
            statusdump: gameStatus.getStatusDump()
        }
    );
}

async function _readAllDominionsGames() {
    const dom5GameNames = await fsp.readdir(DOM5_SAVEDGAMES_PATH);
    const dom5GameObjects = dom5GameNames.map((name) => { return { name: name, gameType: configStore.dom5GameTypeName}; } );

    const dom6GameNames = await fsp.readdir(DOM6_SAVEDGAMES_PATH);
    const dom6GameObjects = dom6GameNames.map((name) => { return { name: name, gameType: configStore.dom6GameTypeName}; } );
    
    return [...dom5GameObjects, ...dom6GameObjects];
}

function _getWrappersByGameType(gameType) {
    if (gameType === configStore.dom6GameTypeName)
        return DOM6_STATUS_WRAPPERS;

    else if (gameType === configStore.dom5GameTypeName)
        return DOM5_STATUS_WRAPPERS;

    return {};
}
