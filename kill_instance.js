
const rw = require("./reader_writer.js");
const checkIfPortIsInUse = require("./check_port.js");

const msBetweenAttempts = 5000;

module.exports = function(game)
{
	if (game == null)
		return Promise.resolve();

	//Start the kill attempt chain
	return _killAttempt(game, 0, 3);
}

//Tries to kill and sets a timeout check to verify the instance is killed
//later on. If it's not killed, it will call this _killAttempt() again,
//until the game is killed or the maxAttempts have been reached.
function _killAttempt(game, attempts, maxAttempts)
{
	rw.log("general", `Attempt ${attempts}. Max attempts ${maxAttempts}.`);

	if (game.instance != null)
		_kill(game, attempts, maxAttempts);
	
	return new Promise((resolve, reject) =>
	{
		setTimeout(() => 
		{
			return _timeoutCheckIfKilled(game, attempts, maxAttempts)
			.then(() => resolve())
			.catch((err) => reject(err));
	
		}, msBetweenAttempts);
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


	//The SIGKILL signal is the one that kills a process
	if (process.platform === "linux")
		_killOnLinux(game);

	//use SIGKILL as final attempt (SIGKILL closes a process without
	//elegantly letting it end)
	else if (attempts === maxAttempts - 1)
		game.instance.kill(game.instance.pid);

	else
		game.instance.kill("SIGTERM");
}

//Does the necessary killing on Linux
function _killOnLinux(game)
{
	rw.log("general", 'Running on Linux, attempting the domk bash /home/steam/bin/domk.sh ...');

	const { spawn } = require('child_process');

	//killing script in the host servers
	const domk = spawn('/home/steam/bin/domk.sh', [game.port]/*, {shell: true}*/);

	domk.on("error", (err) => rw.log("error", "Error occurred when running domk: ", err));

	domk.stdout.on('data', (data) => rw.log("general", "domk stdout data: ", data));
	domk.stderr.on('data', (data) => rw.log("general", "domk stderr data: ", data));

	domk.on("close", (code, signal) => rw.log("general", `domk script closed with code ${code} and signal ${signal}.`));
	domk.on("exit", (code, signal) => rw.log("general", `domk script exited with code ${code} and signal ${signal}.`));
}

//Check if port is still in use after a while. If not, resolve, if yes,
//count an attempt and try again.
function _timeoutCheckIfKilled(game, attempts, maxAttempts)
{
	rw.log("general", "Checking if port is still in use...");

	return checkIfPortIsInUse(game.port)
	.then((isPortInUse) =>
	{
		rw.log("general", `isPortInUse returns ${isPortInUse}`);

		//All good
		if (isPortInUse === false && (game.instance == null || game.instance.killed === true))
		{
			rw.log("general", "Port not in use, instance is null. Success.");
			return Promise.resolve();
		}

		rw.log("general", "Instance is not killed either.");

		if (attempts < maxAttempts)
			return _killAttempt(game, ++attempts, 3);

		//max attempts reached
		if (isPortInUse === true && (game.instance == null || game.instance.killed === true))
		{
			rw.log("error", `${game.name}'s instance was terminated but the port is still in use after ${maxAttempts} attempts.`);
			return Promise.reject(new Error(`The game instance was terminated, but the port is still in use. You might have to wait a bit.`));
		}

		else
		{
			rw.log("error", `${game.name}'s instance could not be terminated and the port is still in use after ${maxAttempts} attempts.`);
			return Promise.reject(new Error(`The game instance could not be terminated and the port is still in use. You might have to wait a bit.`));
		}
	});
}