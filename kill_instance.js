
const log = require("./logger.js");
const checkIfPortIsAvailable = require("./is_port_open.js");

const DELAY_BETWEEN_CHECKS = 12000;
const NUMBER_OF_CHECKS = 10;


module.exports = function(game)
{
	if (game == null)
	{
		log.general(log.getNormalLevel(), `Game is null or not running; no need to kill`);
		return Promise.resolve();
	}

	log.general(log.getNormalLevel(), `'${game.getName()}' at ${game.getPort()}: Starting kill attempts...`);

	// Start the kill attempt chain
	return _killAttempt(game, 0, NUMBER_OF_CHECKS);
}

// Tries to kill and sets a timeout check to verify the instance is killed
// later on. If it's not killed, it will call this _killAttempt() again,
// until the game is killed or the maxAttempts have been reached.
function _killAttempt(game, attempts, maxAttempts)
{
	const process = game.getProcess();
	log.general(log.getVerboseLevel(), `'${game.getName()}' at ${game.getPort()}: Attempt ${attempts}. Max attempts ${maxAttempts}.`);

	// When Node's child process instance has its .killed property set to true,
	// it means it has received the kill signal properly, thus no point in sending more
	if (process != null && process.killed === false)
		_kill(process, attempts, maxAttempts);
	
	return new Promise((resolve, reject) =>
	{
		setTimeout(() => 
		{
			return _checkIfKilled(game, attempts, maxAttempts)
			.then(() => resolve())
			.catch((err) => reject(err));
	
		}, DELAY_BETWEEN_CHECKS);
	});
}

// Sends the necessary kill signals to the game
function _kill(process)
{
	// Destroy all data streams before killing the instance
	if (process.stderr != null)
		process.stderr.destroy();

	if (process.stdin != null)
		process.stdin.end();

	if (process.stdout != null)
		process.stdout.destroy();

	return process.kill("SIGTERM");
}

// Check if port is still in use after a while. If not, resolve, if yes,
// count an attempt and try again.
function _checkIfKilled(game, attempts, maxAttempts)
{
	log.general(log.getVerboseLevel(), `'${game.getName()}' at ${game.getPort()}: Checking if port is still in use...`);

	return checkIfPortIsAvailable(game.getPort())
	.then((isPortAvailable) =>
	{
		if (game.isOnline() === false)
		{
			if (isPortAvailable === true)
			{
				log.general(log.getNormalLevel(), `'${game.getName()}' at ${game.getPort()}: Instance terminated, port available. Success.`);
				return Promise.resolve();
			}

			else log.general(log.getVerboseLevel(), `'${game.getName()}' at ${game.getPort()}: Instance terminated, port busy`);
		}

		else log.general(log.getNormalLevel(), `'${game.getName()}' at ${game.getPort()}: Instance is not killed.`);
		

		if (attempts < maxAttempts)
			return _killAttempt(game, ++attempts, maxAttempts);

		// Max attempts reached and port still not available
		if (isPortAvailable === false && game.isOnline() === false)
		{
			log.error(log.getLeanLevel(), `'${game.getName()}' at ${game.getPort()}: TERMINATED BUT PORT STILL IN USE AFTER ${maxAttempts} ATTEMPTS`);
			return Promise.reject(new Error(`The game instance was terminated, but port ${game.getPort()} still in use. You might have to wait a bit.`));
		}

		else
		{
			log.error(log.getLeanLevel(), `'${game.getName()}' at ${game.getPort()}: COULD NOT BE TERMINATED.`);
			return Promise.reject(new Error(`The game instance could not be terminated and port ${game.getPort()} is still in use. You might have to try again.`));
		}
	});
}
