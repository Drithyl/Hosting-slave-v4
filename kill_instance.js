
const log = require("./logger.js");
const checkIfPortIsAvailable = require("./is_port_open.js");

const MS_BETWEEN_ATTEMPTS = 3000;
const DELAY_AFTER_KILLED_SUCCESS = 5000;

module.exports = function(game)
{
	// Ensure that it's a proper game from the hosted_games_store that's passed,
	// not game data sent directly by master server, or the isRunning flag won't
	// be present
	if (game == null || game.isRunning !== true)
	{
		log.general(log.getNormalLevel(), `Game instance is null or not running; no need to kill`, game);
		return Promise.resolve();
	}

	//Start the kill attempt chain
	return _killAttempt(game, 0, 6);
}

//Tries to kill and sets a timeout check to verify the instance is killed
//later on. If it's not killed, it will call this _killAttempt() again,
//until the game is killed or the maxAttempts have been reached.
function _killAttempt(game, attempts, maxAttempts)
{
	log.general(log.getNormalLevel(), `Attempt ${attempts}. Max attempts ${maxAttempts}.`);

	if (game.isRunning === true)
		_kill(game, attempts, maxAttempts);
	
	return new Promise((resolve, reject) =>
	{
		setTimeout(() => 
		{
			return _timeoutCheckIfKilled(game, attempts, maxAttempts)
			.then(() => resolve())
			.catch((err) => reject(err));
	
		}, MS_BETWEEN_ATTEMPTS);
	});
}

//Sends the necessary kill signals to the game
function _kill(game, attempts, maxAttempts)
{
	//destroy all data streams before killing the instance
	if (game.instance.stderr != null)
		game.instance.stderr.destroy();

	if (game.instance.stdin != null)
		game.instance.stdin.destroy();

	if (game.instance.stdout != null)
		game.instance.stdout.destroy();


	//use SIGKILL as final attempt (SIGKILL closes a process without
	//elegantly letting it end), or a bash script on Linux
	if (attempts === maxAttempts - 1)
	{
		/*if (process.platform === "linux")
			_killOnLinux(game);

		else game.instance.kill(game.instance.pid);*/
		game.instance.kill("SIGKILL");
	}

	else game.instance.kill("SIGTERM");
}

//Does the necessary killing on Linux
function _killOnLinux(game)
{
	log.general(log.getVerboseLevel(), 'Running on Linux, attempting the domk bash /home/steam/bin/domk.sh ...');

	const { spawn } = require('child_process');

	//killing script in the host servers
	const domk = spawn('/home/steam/bin/domk.sh', [game.port]/*, {shell: true}*/);

	domk.on("error", (err) => log.error(log.getLeanLevel(), "ERROR RUNNING domk", err));

	domk.stdout.on('data', (data) => log.general(log.getVerboseLevel(), "domk stdout data: ", data));
	domk.stderr.on('data', (data) => log.general(log.getVerboseLevel(), "domk stderr data: ", data));

	domk.on("close", (code, signal) => log.general(log.getVerboseLevel(), `domk script closed with code ${code} and signal ${signal}.`));
	domk.on("exit", (code, signal) => log.general(log.getVerboseLevel(), `domk script exited with code ${code} and signal ${signal}.`));
}

//Check if port is still in use after a while. If not, resolve, if yes,
//count an attempt and try again.
function _timeoutCheckIfKilled(game, attempts, maxAttempts)
{
	log.general(log.getVerboseLevel(), "Checking if port is still in use...");

	return checkIfPortIsAvailable(game.port)
	.then((isPortAvailable) =>
	{
		log.general(log.getVerboseLevel(), `isPortAvailable returns ${isPortAvailable}`);

		//All good
		if (isPortAvailable === true && game.isRunning !== true)
		{
			log.general(log.getNormalLevel(), "Port available, instance is null. Success.");
			
			return Promise.resolve((resolve) => setTimeout(resolve, DELAY_AFTER_KILLED_SUCCESS));
		}

		log.general(log.getNormalLevel(), "Instance is not killed either.");

		if (attempts < maxAttempts)
			return _killAttempt(game, ++attempts, maxAttempts);

		//max attempts reached
		if (isPortAvailable === false && game.isRunning !== true)
		{
			log.error(log.getLeanLevel(), `${game.name}'s TERMINATED BUT PORT STILL IN USE AFTER ${maxAttempts} ATTEMPTS`);
			return Promise.reject(new Error(`The game instance was terminated, but the port is still in use. You might have to wait a bit.`));
		}

		else
		{
			log.error(log.getLeanLevel(), `${game.name}'s COULD NOT BE TERMINATED.`);
			return Promise.reject(new Error(`The game instance could not be terminated and the port is still in use. You might have to try again.`));
		}
	});
}
