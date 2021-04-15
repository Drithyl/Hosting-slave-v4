
const log = require("./logger.js");
const configStore = require("./config_store.js");
const gameInterface = require("./hosted_games_store.js");

var reservedPorts = [];

module.exports.reservePort = function()
{
	var reservedPort = configStore.gamePortRange.first.toString();
	var usedPorts = gameInterface.getUsedPorts().concat(reservedPorts);

	while (usedPorts.includes(reservedPort.toString()) === true)
	{
		reservedPort++;

		if (reservedPort > configStore.gamePortRange.last)
		    return Promise.reject(new Error(`There are no free ports.`));
	}

	reservedPorts.push(reservedPort);
	return Promise.resolve(+reservedPort);
};

module.exports.releasePort = function(port)
{
    reservedPorts.splice(reservedPorts.indexOf(port), 1);
    return Promise.resolve();
};

module.exports.releaseAllPorts = function()
{
	reservedPorts = [];
	log.general(log.getLeanLevel(), `Released reserved assisted hosting instance ports.`);
};