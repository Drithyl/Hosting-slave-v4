
const rw = require("./reader_writer.js");
const config = require("./config.json");
const gameInterface = require("./hosted_games_store.js");

var reservedPorts = [];

module.exports.reservePort = function()
{
	var reservedPort = config.gamePortRange.first.toString();
	var usedPorts = gameInterface.getUsedPorts().concat(reservedPorts);

	while (usedPorts.includes(reservedPort.toString()) === true)
	{
		reservedPort++;

		if (reservedPort > config.gamePortRange.last)
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
	rw.log("general", `Released reserved assistted hosting instance ports.`);
};