
const log = require("../logger.js");
const gameInterface = require("./hosted_games_store.js");

var reservedPorts = [];

module.exports.reservePort = function()
{
	const reservedPort = exports.findFirstFreePort();
	
	if (reservedPort == null)
	{
		return Promise.reject(new Error(`There are no free ports.`));
	}

	reservedPorts.push(reservedPort);
	return Promise.resolve(reservedPort);
};

module.exports.findFirstFreePort = function()
{
	var port = +process.env.GAME_PORT_RANGE_START;
	const usedPorts = gameInterface.getUsedPorts().concat(reservedPorts);

	while (usedPorts.includes(port) === true)
	{
		port++;

		if (port > +process.env.GAME_PORT_RANGE_END)
		    return null;
	}

	return port;
};

module.exports.releasePort = function(port)
{
    reservedPorts.splice(reservedPorts.indexOf(+port), 1);
    return Promise.resolve();
};

module.exports.releaseAllPorts = function()
{
	reservedPorts = [];
	log.general(log.getLeanLevel(), `Released reserved assisted hosting instance ports.`);
};