
const fs = require("fs");
const log = require("./logger.js");
const configStore = require("./config_store.js");
const kill = require("./kill_instance.js");
const spawn = require("./process_spawn.js").spawn;
const dom5Interface = require("./dom5_interface.js");

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
    log.general(log.getVerboseLevel(), `Game data received:`, gameDataArray);

	//first connection to master server
	if (Object.keys(hostedGames).length <= 0)
	{
        log.general(log.getVerboseLevel(), `First connection to the master server since node started; populating the store...`);
        gameDataArray.forEach((gameData) => 
        {
            hostedGames[gameData.port] = gameData;
            log.general(log.getNormalLevel(), `Added game ${gameData.name} at port ${gameData.port}.`);
        });

        log.general(log.getVerboseLevel(), "List of games after first initialization", hostedGames)

		return Promise.resolve();
    }
    
    log.general(log.getVerboseLevel(), `Comparing existing games with the data received...`);

	//not the first connection, some data from master server already exists
	//check for doubles and override them
	gameDataArray.forEach((gameData) =>
	{
        if (hostedGames[gameData.port] == null)
        {
            hostedGames[gameData.port] = gameData;
            log.general(log.getVerboseLevel(), `Game ${gameData.name} at port ${gameData.port} is new; added to store.`);
        }

		//if game data is already in this store, overwrite it
        else 
        {
            // Overwrite it by reassigning the properties received; but don't remove old
            // keys like .instance or isRunning so that the slave is aware that it's still
            // running and doesn't try to launch it again when requested, or it won't be able
            // to kill it even if the requestHosting() function tries to (since the instance
            // property will be lost)
            Object.assign(hostedGames[gameData.port], gameData);
            log.general(log.getVerboseLevel(), `Game ${gameData.name} already exists at port ${gameData.port}; data was overwritten.`);
        }
    });

	//check for hostedGames that exist in memory here but not on the master server and delete those
    for (var port in hostedGames)
    {
        const existingGame = hostedGames[port];

        if (gameDataArray.find((gameData) => gameData.port === existingGame.port) == null)
		{
            log.general(log.getVerboseLevel(), `${existingGame.name} at port ${existingGame.port} was not found on master data; killing and removing it...`);

            exports.killGame(port)
            .then(() =>
            {
                delete hostedGames[port];
                log.general(log.getVerboseLevel(), `${existingGame.name} at port ${existingGame.port} was removed.`);
            })
            .catch((err) => log.error(log.getLeanLevel(), `ERROR KILLING ABANDONED GAME`, err));
		}
    }

    log.general(log.getNormalLevel(), "List of games initialized.");
    
    return Promise.resolve();
};

module.exports.getGame = function(port)
{
    return hostedGames[port];
};

module.exports.getUsedPorts = function()
{
	return Object.keys(hostedGames);
};

module.exports.isGameNameUsed = function(name)
{
	var savePath = `${configStore.dom5DataPath}/savedgames/${name}`;

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

module.exports.killAllGames = function()
{
	hostedGames.forEachItem((game, port) =>
	{
        if (game.instance != null)
        {
            log.general(log.getNormalLevel(), `Killing ${game.name}...`);

            return exports.killGame(port)
            .catch((err) => log.error(log.getLeanLevel(), `COULD NOT KILL ${game.name} AT PORT ${port}`, err));
        }
	});
};

module.exports.requestHosting = function(gameData)
{
    const delay = configStore.gameHostMsDelay * gameHostRequests.length;

    if (exports.isGameOnline(gameData.port) === true)
        return Promise.resolve();

	return exports.killGame(gameData.port)
	.then(() =>
	{
        gameHostRequests.push(gameData.port);
		log.general(log.getNormalLevel(), `Requesting hosting for ${gameData.name} on port ${gameData.port}...`);
        
        return _setTimeoutPromise(delay, _host.bind(null, gameData));
    })
    .then(() => Promise.resolve())
    .catch((err) => Promise.reject(err));
};

module.exports.isGameOnline = function(port)
{
	return hostedGames[port] != null && hostedGames[port].instance != null && hostedGames[port].isRunning === true;
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
	let game = hostedGames[data.port];
	delete game.args;

	game.args = [...data.args];
	return Promise.resolve();
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

function _host(gameData)
{
    gameHostRequests.splice(gameHostRequests.indexOf(gameData.port), 1);

    return spawn(gameData)
    .then(() => 
    {
        hostedGames[gameData.port] = gameData;
        log.general(log.getNormalLevel(), `Added ${gameData.name} to game store`);
        
        /** If the game is not in the lobby, then change the timer to the
         *  default and current ones sent by the master server to ensure
         *  that they are both correct even after a turn rolls.
         */
        if (dom5Interface.hasStarted(gameData) === true)
            return dom5Interface.changeTimer(gameData);

        else return Promise.resolve();
    })
    .catch((err) => Promise.reject(err));
}