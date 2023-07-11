
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const Game = require("./dom5/game.js");
const kill = require("./kill_instance.js");
const configStore = require("./config_store.js");
const checkIfPortOpen = require("./is_port_open.js");
const dom5Interface = require("./dom5_interface.js");
const statusStore = require("./game_status_store.js");
const reservedPortsStore = require("./reserved_ports_store.js");

var hostedGames = {};

//queue of games pending hosting
var gameHostRequests = [];


module.exports.populate = async function(gameDataArray)
{
    for (var gameData of gameDataArray)
    {
        if (_gameDataExists(gameData) === false)
        {
            await _addNewGame(gameData);
            statusStore.sendStatusUpdateToMaster(gameData.name);
            log.general(log.getVerboseLevel(), `Game ${gameData.name} at port ${gameData.port} is new; added to store.`);
            continue;
        }

        const oldGame = hostedGames[gameData.port];
        const newGame = new Game(gameData.name, gameData.port, gameData.args);

        // If not same settings, kill old game and overwrite with new game
        if (Game.areSameSettings(oldGame, newGame) === false)
        {
            log.general(log.getVerboseLevel(), `Game ${gameData.name} already exists at port ${gameData.port} but with different settings; data is being overwritten...`);
            await _overwriteGame(oldGame, newGame);
            statusStore.sendStatusUpdateToMaster(gameData.name);
        }
    }

    log.general(log.getLeanLevel(), "Game store populated.");
};

module.exports.getGame = function(port)
{
    return hostedGames[port];
};

module.exports.getGameByName = function(gameName)
{
    return _getGameByName(gameName);
};

module.exports.requestHosting = async function(gameData)
{
    var game = hostedGames[gameData.port];
    var isPortOpen = await checkIfPortOpen(gameData.port);

    if (game == null)
        game = await _addNewGame(gameData);

    if (game.isOnline() === true)
    {
        log.general(log.getVerboseLevel(), `'${game.getName()}' at ${game.getPort()}: Already online; no need to launch`);
        return Promise.resolve();
    }

    if (isPortOpen === false)
    {
        log.error(log.getVerboseLevel(), `'${game.getName()}' at ${game.getPort()}: Not online, but port is still busy. Cannot launch`);
        return Promise.reject(new Error(`'${game.getName()}' at ${game.getPort()} is not online, but port is still busy. Cannot launch`));
    }

    if (gameHostRequests.includes(game.getPort()) === true)
    {
        log.general(log.getVerboseLevel(), `'${game.getName()}' at ${game.getPort()}: Already in queue to be launched`);
        return Promise.resolve();
    }

    // Due to the asynchronous code of isOnline above, this variable has to be
    // declared here or it will always be 0 if declared above
    const delay = configStore.gameHostMsDelay * gameHostRequests.length;

    gameHostRequests.push(game.getPort());
    _setTimeoutPromise(delay, _host.bind(null, game, gameData));
    log.general(log.getVerboseLevel(), `'${game.getName()}' at ${game.getPort()}: Added to hosting queue with ${delay}ms delay`);
};

module.exports.getUsedPorts = function()
{
	return Object.keys(hostedGames).map((portStr) => +portStr);
};

module.exports.resetPort = async function(gameData)
{
    const game = hostedGames[gameData.port];
    const newPort = reservedPortsStore.findFirstFreePort();

    if (newPort == null)
    {
        throw new Error("There are no free ports available");
    }

    await exports.killGameByName(gameData.name);
    
    hostedGames[newPort] = game;
    game.setPort(newPort);

    if (gameData.name == game.getName())
        delete hostedGames[gameData.port];

    return newPort;
};

module.exports.isGameNameUsed = function(name)
{
	var savePath = path.resolve(configStore.dom5DataPath, "savedgames", name);

	if (fs.existsSync(savePath) === true)
		return Promise.resolve(true);

	else return Promise.resolve(false);
};

module.exports.killGame = function(port)
{
	return kill(hostedGames[port])
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.killGameByName = function(name)
{
    const game = _getGameByName(name);

	return kill(game)
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.killAllGames = function()
{
	hostedGames.forEachItem((game, port) =>
	{
        if (game.isOnline()  === true)
        {
            log.general(log.getNormalLevel(), `Killing ${game.getName()}...`);

            return exports.killGame(port)
            .catch((err) => log.error(log.getLeanLevel(), `COULD NOT KILL ${game.getName()} AT PORT ${port}`, err));
        }
	});
};

module.exports.isGameOnline = function(port)
{
	return hostedGames[port] != null && hostedGames[port].isOnline();
};

module.exports.deleteFtherlndFile = function(data)
{
    const ftherlndPath = path.resolve(configStore.dom5DataPath, "savedgames", data.name, "ftherlnd");

    if (fs.existsSync(ftherlndPath) === false)
        return Promise.resolve();

    return fsp.unlink(ftherlndPath);
};

module.exports.deleteGame = function(data)
{
    const port = data.port;

	return exports.killGame(port)
    .then(() => dom5Interface.deleteGameSavefiles(data))
    .then(() =>
    {
        delete hostedGames[port];
        statusStore.removeGame(data.name);
        return Promise.resolve();
    })
	.catch((err) => Promise.reject(err));
};

module.exports.deleteGameData = function(data)
{
	return exports.killGame(data.port)
	.then(() => 
	{
		delete hostedGames[data.port];
		return Promise.resolve();
	})
	.catch((err) => Promise.reject(err));
};

module.exports.overwriteSettings = function(data)
{
	const game = hostedGames[data.port];

    if (game == null)
        return Promise.reject(new Error(`Game does not exist in store. If you just hosted it, use !launch.`));

	game.setArgs(data.args);

    // If ftherlnd exists, it must be deleted, as some settings
    // are hardcoded inside it once the savedgames folder of
    // the game is created, like master password or maps
    return exports.deleteFtherlndFile(data);
};


function _gameDataExists(gameData)
{
    return hostedGames[gameData.port] != null;   
}

async function _addNewGame(gameData)
{
    hostedGames[gameData.port] = new Game(gameData.name, gameData.port, gameData.args);
    await statusStore.addGame(hostedGames[gameData.port]);
    return hostedGames[gameData.port];
}

async function _overwriteGame(existingGame, newGame)
{
    await exports.killGame(existingGame.getPort());
    hostedGames[newGame.getPort()] = newGame;
    await awaitstatusStore.addGame(newGame);
    log.general(log.getLeanLevel(), `Game ${newGame.getName()} received different data from master; overwriting it`);
}

function _setTimeoutPromise(delay, fnToCall)
{
    return new Promise((resolve, reject) =>
    {
        const timeout = setTimeout(() =>
        {
            Promise.resolve(fnToCall())
            .then(() => resolve(timeout))
            .catch((err) => reject(err));

        }, delay);
    });
}

async function _host(game, timerData, isCurrentTurnRollback)
{
    gameHostRequests.splice(gameHostRequests.indexOf(game.getPort()), 1);
    log.general(log.getNormalLevel(), `'${game.getName()}' at ${game.getPort()}: Launching process...`);

    if (isCurrentTurnRollback === true)
        await game.launchProcessWithRollbackedTurn();

    else await game.launchProcess();

    log.general(log.getNormalLevel(), `'${game.getName()}' at ${game.getPort()}: Process launched successfully!`);
    
    /** If the game is not in the lobby, then change the timer to the
     *  default and current ones sent by the master server to ensure
     *  that they are both correct even after a turn rolls.
     */
    if (dom5Interface.hasStarted(game.getName()) === true)
        return dom5Interface.changeTimer(timerData);

    else return Promise.resolve();
}

function _getGameByName(gameName)
{
    for (var port in hostedGames)
        if (hostedGames[port].getName() == gameName)
            return hostedGames[port];
}