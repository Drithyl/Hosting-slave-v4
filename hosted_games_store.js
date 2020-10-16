
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

module.exports.populate = function(gameDataArray, serverCb)
{
	//first connection to master server
	if (hostedGames == null)
	{
		hostedGames = gameDataReceived;
		return serverCb();
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
}

module.exports.getUsedPorts = function()
{
	return Object.keys(hostedGames);
};

module.exports.isGameNameUsed = function(name, cb)
{
	var savePath = `${config.dom5DataPath}/savedgames/${name}`;

	if (fs.existsSync(savePath) === true)
		cb(null, true);

	else cb(null, false);
};

module.exports.killGame = function(port, cb)
{
	kill(hostedGames[port], cb)
	.then(() => cb())
	.catch((err) => cb(err));
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
	.then(() => cb(null))
	.catch((err) => cb(err.message));
};

module.exports.requestHosting = function(game, cb)
{
	return kill(game)
	.then(() =>
	{
		rw.log("general", `Requesting hosting for ${game.name}...`);
		gameHostRequests.push(game.port);

		//sets a delay so that when many host requests are received, the server
		//does not get overloaded
		setTimeout(() =>
		{
			gameHostRequests.splice(gameHostRequests.indexOf(game.port), 1);
			spawn(game)
			.then(() => 
			{
				hostedGames[game.port] = game;
				cb(null);
			})
			.catch((err) => cb(err.message));

		}, config.gameHostMsDelay * gameHostRequests.length);
	});
};

module.exports.isGameOnline = function(port)
{
	return hostedGames[port] != null && hostedGames[port].instance != null && hostedGames[port].instance.killed === false;
};

module.exports.deleteGameSavefiles = function(data, cb)
{
	return kill(hostedGames[data.port])
	.then(() => dom5Interface.deleteGameSavefiles(data, cb))
	.then(() => cb())
	.catch((err) => cb(err.message));
};

module.exports.deleteGameData = function(data, cb)
{
	return kill(hostedGames[data.port])
	.then(() => 
	{
		delete hostedGames[data.port];
		cb();
	})
	.catch((err) => cb(err.message));
};

module.exports.overwriteSettings = function(data, cb)
{
	let game = hostedGames[data.port];
	delete game.args;

	game.args = [...data.args];
	cb();
}

function deleteGameReferences(port)
{
	delete hostedGames[port];
}
