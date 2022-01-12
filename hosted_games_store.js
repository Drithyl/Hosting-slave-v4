
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const Game = require("./dom5/game.js");
const configStore = require("./config_store.js");
const kill = require("./kill_instance.js");
const dom5Interface = require("./dom5_interface.js");
const statusStore = require("./game_status_store.js");
const reservedPortsStore = require("./reserved_ports_store.js");

/************************************************************
*                         GAME LIST                         *
*             {name, port, gameType, instance}              *
*     Indexed by port numbers, received from master server  *
************************************************************/
var hostedGames = {};

//queue of games pending hosting
var gameHostRequests = [];

module.exports.populate = function(gameDataArray)
{
	//first connection to master server
	if (Object.keys(hostedGames).length <= 0)
	{
        log.general(log.getLeanLevel(), `First connection to the master server since node started; populating the store...`);
        gameDataArray.forEach((gameData) => 
        {
            hostedGames[gameData.port] = new Game(gameData.name, gameData.port, gameData.args);
            statusStore.addGame(hostedGames[gameData.port]);
            log.general(log.getLeanLevel(), `Added game ${gameData.name} at port ${gameData.port}.`);
        });

        log.general(log.getLeanLevel(), "Game store populated.");
        return Promise.resolve();
    }
    
    log.general(log.getVerboseLevel(), `Comparing existing games with the data received...`);

	//not the first connection, some data from master server already exists
	//check for doubles and override them
	gameDataArray.forEach((gameData) =>
	{
        if (hostedGames[gameData.port] == null)
        {
            hostedGames[gameData.port] = new Game(gameData.name, gameData.port, gameData.args);
            statusStore.addGame(hostedGames[gameData.port]);
            log.general(log.getVerboseLevel(), `Game ${gameData.name} at port ${gameData.port} is new; added to store.`);
        }

		//if there's a game in the same port, check if it needs overwriting
        else 
        {
            const oldGame = hostedGames[gameData.port];
            const newGame = new Game(gameData.name, gameData.port, gameData.args);

            // If not same settings, kill old game and overwrite with new game
            if (Game.areSameSettings(oldGame, newGame) === false)
            {
                log.general(log.getVerboseLevel(), `Game ${gameData.name} already exists at port ${gameData.port} but with different settings; data is being overwritten...`);
                module.exports.killGame(oldGame.getPort())
                .then(() => 
                {
                    hostedGames[newGame.getPort()] = newGame;
                    statusStore.addGame(newGame);
                    log.general(log.getVerboseLevel(), `New data for game ${newGame.getName()} added`);
                });
            }

            else log.general(log.getVerboseLevel(), `Game ${gameData.name} already exists at port with same settings`);
        }
    });

	//check for hostedGames that exist in memory here but not on the master server and delete those
    for (var port in hostedGames)
    {
        const existingGame = hostedGames[port];

        if (gameDataArray.find((gameData) => gameData.port === existingGame.getPort()) == null)
		{
            log.general(log.getVerboseLevel(), `${existingGame.getName()} at port ${existingGame.getPort()} was not found on master data; killing and removing it...`);

            exports.killGame(port)
            .then(() =>
            {
                log.general(log.getVerboseLevel(), `${existingGame.getName()} at port ${existingGame.getPort()} was removed.`);
                delete hostedGames[port];
            })
            .catch((err) => log.error(log.getLeanLevel(), `ERROR KILLING ABANDONED GAME`, err));
		}
    }

    log.general(log.getLeanLevel(), "Game store populated.");
    return Promise.resolve();
};

module.exports.getGame = function(port)
{
    return hostedGames[port];
};

module.exports.requestHosting = async function(gameData)
{
    log.general(log.getNormalLevel(), `'${gameData.name}' at ${gameData.port}: Requesting hosting...`);
    var game = hostedGames[gameData.port];

    if (game == null)
    {
        game = new Game(gameData.name, gameData.port, gameData.args);
        hostedGames[gameData.port] = game;
    }

    if (game.isOnline() === true)
    {
        log.general(log.getNormalLevel(), `'${game.getName()}' at ${game.getPort()}: Already online; no need to launch`);
        return Promise.resolve();
    }

    // Due to the asynchronous code of isOnline above, this variable has to be
    // declared here or it will always be 0 if declared above
    const delay = configStore.gameHostMsDelay * gameHostRequests.length;
    gameHostRequests.push(game.getPort());
    log.general(log.getNormalLevel(), `'${game.getName()}' at ${game.getPort()}: Added to hosting queue with ${delay}ms delay`);
    
    _setTimeoutPromise(delay, _host.bind(null, game, gameData));
    return Promise.resolve();
};

module.exports.getUsedPorts = function()
{
	return Object.keys(hostedGames).map((portStr) => +portStr);
};

module.exports.resetPort = function(gameData)
{
    const game = hostedGames[gameData.port];
    const newPort = reservedPortsStore.reservePort();

    return exports.killGameByName(gameData.name)
    .then(() =>
    {
        hostedGames[newPort] = game;
        game.setPort(newPort);

        if (gameData.name == game.getName())
            delete hostedGames[gameData.port];

        return Promise.resolve(newPort);
    })
    .catch((err) => Promise.reject(new Error(`Could not kill ${gameData.name}; can't do the port transfer. Try again later.`)));
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
	game.setArgs(data.args);

    // If ftherlnd exists, it must be deleted, as some settings
    // are hardcoded inside it once the savedgames folder of
    // the game is created, like master password or maps
    return exports.deleteFtherlndFile(data);
};

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
        if (hostedGames[port].name == gameName)
            return hostedGames[port];
}