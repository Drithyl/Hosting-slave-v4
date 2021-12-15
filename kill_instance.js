
const log = require("./logger.js");
const checkIfPortIsAvailable = require("./is_port_open.js");

const DELAY_BETWEEN_CHECKS = 12000;
const NUMBER_OF_CHECKS = 10;


module.exports = function(game)
{
	if (game == null || _isGameRunning(game) === false)
	{
		log.general(log.getNormalLevel(), `Game is null or not running; no need to kill`);
		return Promise.resolve();
	}

	log.general(log.getNormalLevel(), `'${game.name}' at ${game.port}: Starting kill attempts...`);

	// Start the kill attempt chain
	return _killAttempt(game, 0, NUMBER_OF_CHECKS);
}

function _isGameRunning(game)
{
	// The condition covers not only isRunning being true, but also 
	// the instance not being null, so that instances which may not 
	// have had their isRunning property set to true on spawning can still be killed
	return game.isRunning === true || game.instance != null;
}

// Tries to kill and sets a timeout check to verify the instance is killed
// later on. If it's not killed, it will call this _killAttempt() again,
// until the game is killed or the maxAttempts have been reached.
function _killAttempt(game, attempts, maxAttempts)
{
	log.general(log.getVerboseLevel(), `'${game.name}' at ${game.port}: Attempt ${attempts}. Max attempts ${maxAttempts}.`);

	// When Node's child process instance has its .killed property set to true,
	// it means it has received the kill signal properly, thus no point in sending more
	if (game.instance != null && game.instance.killed === false)
		_kill(game, attempts, maxAttempts);
	
	return new Promise((resolve, reject) =>
	{
		setTimeout(() => 
		{
			return _timeoutCheckIfKilled(game, attempts, maxAttempts)
			.then(() => resolve())
			.catch((err) => reject(err));
	
		}, DELAY_BETWEEN_CHECKS);
	});
}

// Sends the necessary kill signals to the game
function _kill(game)
{
	// Destroy all data streams before killing the instance
	if (game.instance.stderr != null)
		game.instance.stderr.destroy();

	if (game.instance.stdin != null)
		game.instance.stdin.destroy();

	if (game.instance.stdout != null)
		game.instance.stdout.destroy();

	return game.instance.kill("SIGTERM");
}

// Check if port is still in use after a while. If not, resolve, if yes,
// count an attempt and try again.
function _timeoutCheckIfKilled(game, attempts, maxAttempts)
{
	log.general(log.getVerboseLevel(), `'${game.name}' at ${game.port}: Checking if port is still in use...`);

	return checkIfPortIsAvailable(game.port)
	.then((isPortAvailable) =>
	{
		if (_isGameTerminated(game) === true)
		{
			if (isPortAvailable === true)
			{
				log.general(log.getNormalLevel(), `'${game.name}' at ${game.port}: Instance terminated, port available. Success.`);
				return Promise.resolve();
			}

			else log.general(log.getVerboseLevel(), `'${game.name}' at ${game.port}: Instance terminated, port busy`);
		}

		else log.general(log.getNormalLevel(), `'${game.name}' at ${game.port}: Instance is not killed.`);
		

		if (attempts < maxAttempts)
			return _killAttempt(game, ++attempts, maxAttempts);

		// Max attempts reached and port still not available
		if (isPortAvailable === false && _isGameTerminated(game) === true)
		{
			log.error(log.getLeanLevel(), `'${game.name}' at ${game.port}: TERMINATED BUT PORT STILL IN USE AFTER ${maxAttempts} ATTEMPTS`);
			return Promise.reject(new Error(`The game instance was terminated, but port ${game.port} still in use. You might have to wait a bit.`));
		}

		else
		{
			log.error(log.getLeanLevel(), `'${game.name}' at ${game.port}: COULD NOT BE TERMINATED.`);
			return Promise.reject(new Error(`The game instance could not be terminated and port ${game.port} is still in use. You might have to try again.`));
		}
	});
}

function _isGameTerminated(game)
{
	// The flag game.isRunning === false will *always*
	// be set when the instance has been killed and
	// its "exit" stdio event gets triggered
	return game.isRunning === false;
}
