
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const kill = require("./kill_instance.js");
const spawn = require("./process_spawn.js").spawn;
const dom5Interface = require("./dom5_interface.js");

/************************************************************
*                         GAME LIST                         *
*             {name, port, gameType, instance}              *
*     Indexed by port numbers, received from master server  *
************************************************************/
var hostedGames;

//queue of games pending hosting
var gameHostRequests = [];

module.exports.populate = function(gameDataArray)
{
    console.log(`Game data received:`, gameDataArray);
    
	//first connection to master server
	if (hostedGames == null)
	{
		hostedGames = gameDataArray;
		return Promise.resolve();
	}

	//not the first connection, some data from master server already exists
	//check for doubles and override them
	gameDataArray.forEach((gameData) =>
	{
		if (hostedGames[port] == null)
			hostedGames[port] = gameData;

		//if game data is already in this store, overwrite it
		else Object.assign(hostedGames[port], gameData);
	});

	//check for hostedGames that exist in memory here but not on the master server and delete those
	for (var port in hostedGames)
	{
		var existingGame = hostedGames[port];

		if (gameDataArray.find((gameData) => gameData.port === port) == null)
		{
			existingGame.instance.disconnect();
			deleteGameReferences(port);
		}
    }
    
    return Promise.resolve();
}

module.exports.getUsedPorts = function()
{
	return Object.keys(hostedGames);
};

module.exports.isGameNameUsed = function(name)
{
	var savePath = `${config.dom5DataPath}/savedgames/${name}`;

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

module.exports.killAllGames = function(cb)
{
	return hostedGames.forEachPromise((game, index, nextPromise) =>
	{
		if (game.instance == null)
			return nextPromise();

		rw.log("general", `Killing ${game.name}...`);

		return kill(game)
		.then(() => nextPromise());
	})
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.requestHosting = function(game)
{
	return kill(game)
	.then(() =>
	{
		rw.log("general", `Requesting hosting for ${game.name}...`);
		gameHostRequests.push(game.port);

        return new Promise((resolve, reject) =>
        {
            //sets a delay so that when many host requests are received, the server
            //does not get overloaded
            setTimeout(() =>
            {
                gameHostRequests.splice(gameHostRequests.indexOf(game.port), 1);
                spawn(game)
                .then(() => 
                {
                    hostedGames[game.port] = game;
                    resolve();
                })
                .catch((err) => reject(err));

            }, config.gameHostMsDelay * gameHostRequests.length);
        });
    })
    .then(() => Promise.resolve())
    .catch((err) => Promise.reject(err));
};

module.exports.isGameOnline = function(port)
{
	return hostedGames[port] != null && hostedGames[port].instance != null && hostedGames[port].instance.killed === false;
};

module.exports.deleteGameSavefiles = function(data)
{
	return kill(hostedGames[data.port])
	.then(() => dom5Interface.deleteGameSavefiles(data))
	.then(() => Promise.resolve())
	.catch((err) => Promise.reject(err));
};

module.exports.deleteGameData = function(data)
{
	return kill(hostedGames[data.port])
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

function deleteGameReferences(port)
{
	delete hostedGames[port];
}
