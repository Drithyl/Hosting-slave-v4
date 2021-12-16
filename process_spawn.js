
const fs = require("fs");
const log = require("./logger.js");
const assert = require("./asserter.js");
const configStore = require("./config_store.js");
const spawn = require('child_process').spawn;
const socket = require("./socket_wrapper.js");
const statusStore = require("./game_status_store.js");

const REPETITIVE_DATA_DEBOUNCER_INTERVAL = 600000;


module.exports.spawn = function(game, isCurrentTurnRollback = false)
{
	const path = configStore.dom5ExePath;

	log.general(log.getVerboseLevel(), `Base game arguments received`, game.args);

	// Arguments must be passed in an array with one element at a time. Even a flag like --mapfile
	// needs to be its own element, followed by a separate element with its value, i.e. peliwyr.map
	const finalArgs = game.args.concat(_getAdditionalArgs(game, isCurrentTurnRollback));

	if (fs.existsSync(path) === false)
		return Promise.reject(`The path ${path} is incorrect. Cannot host game ${game.name} (${game.gameType}).`);

	if (finalArgs == null)
		return Promise.reject(`No args were provided to host the game ${game.name} (${game.gameType}).`);

	// Stdio pipes are not ignored by default. If these pipes are not listened to (with .on("data") or .pipe())
	// in flowing mode, or periodically read from in paused mode and consuming the data chunks, the instance
	// will eventually hang, as the pipes will fill up and Dominions won't be able to push out more data.
	// This makes the games remain running but unable to be connected, hanging at "Waiting for info..."
	// https://nodejs.org/api/stream.html#stream_class_stream_readable
	// stdio array is [stdin, stdout, stderr]
    game.instance = spawn(path, finalArgs, { stdio: ["ignore", "pipe", "pipe"] });
    game.isRunning = true;
	game.recentDataEmitted = [];

	_attachOnExitListener(game);
	_attachOnCloseListener(game);
	_attachOnErrorListener(game);
	_attachStdioListener("stderr", game);
	_attachStdioListener("stdout", game);

	log.general(log.getLeanLevel(), `Process for ${game.name} spawned.`);
	return Promise.resolve(game);
};

function _attachOnExitListener(game)
{
	//Fires when the process exits. See https://nodejs.org/api/child_process.html#child_process_event_exit
	game.instance.on("exit", (code, signal) =>
	{
        game.isRunning = false;

		// Set offline in status store for uptime counter to stop ticking
		statusStore.setOffline(game.name);

		//If process exited, code is its final code and signal is null;
		//if it was terminated due to a signal, then code is null.
		if (signal === "SIGKILL" || signal === "SIGTERM" || signal === "SIGINT")
		{
			log.general(log.getLeanLevel(), `${game.name}'s was terminated by ${signal}.`);
		}

		else if (code === 0)
		{
			log.general(log.getLeanLevel(), `${game.name}'s exited without errors (perhaps port was already in use).`);
		}

		else if (signal == null)
		{
			log.error(log.getLeanLevel(), `${game.name}'s "exit" TRIGGERED. Maybe an ingame error occurred, or an arg made it crash`, {port: game.port, args: game.args, code: code, signal: signal});
			socket.emit("GAME_EXITED", {name: game.name, code: code});
		}

		//SIGKILL would mean that the kill_instance.js code was called, so it's as expected
		else if (game.instance.killed === false && signal !== "SIGKILL")
		{
			log.error(log.getLeanLevel(), `${game.name}'s "exit" TRIGGERED. Process was abnormally terminated`, {signal: signal});
			socket.emit("GAME_TERMINATED", {name: game.name, signal: signal});
		}
	});
}

function _attachOnCloseListener(game)
{
	//Event fires if the stdio streams are closed (which might be *before* or *after* the actual
	//process exits. See https://nodejs.org/api/child_process.html#child_process_event_close and
	//https://stackoverflow.com/questions/37522010/difference-between-childprocess-close-exit-events)
	game.instance.on("close", (code, signal) =>
	{
		if (signal === "SIGKILL" || signal === "SIGTERM" || signal === "SIGINT")
		{
			log.general(log.getLeanLevel(), `${game.name}'s stdio got closed by ${signal}.`);
		}

		else if (code === 0)
		{
			log.general(log.getLeanLevel(), `${game.name}'s stdio got closed with code 0.`);
		}

		//code 0 means there were no errors. If instance is null, then "exit" above
		//must have run already, so don't ping the master server again
		if (game.instance != null && game.instance.killed === false && code !== 0)
		{
			socket.emit("STDIO_CLOSED", {name: game.name, code: code, signal: signal});
			log.general(log.getLeanLevel(), `${game.name}'s stdio closed:\n`, {port: game.port, args: game.args, code: code, signal: signal});
		}
	});
}

function _attachOnErrorListener(game)
{
	//The process could not be spawned, or
	//the process could not be killed
	//Sometimes an instance will get spawned with an error occurring, but will still be live
	game.instance.on("error", (err) =>
	{
		game.instance = null;
		log.error(log.getLeanLevel(), `${game.name}'s "error" TRIGGERED`, err);
		socket.emit("GAME_ERROR", {name: game.name, error: err.message});
	});
}

function _attachStdioListener(type, game)
{
	// Dom instances push stdout data very often. This is probably what leads to buffer
	// overflow and the instances hanging when it's not being ignored nor listened to
	if (game.instance[type] != null)
	{
        game.instance[type].setEncoding("utf8");
        log.general(log.getNormalLevel(), `Listening to ${game.name}'s ${type} stream.`);

		game.instance[type].on('data', function (data)
		{
			if (_isRelevantData(game, data) === true)
			{
				log.general(log.getNormalLevel(), `${game.name}'s ${type} "data" event triggered:\n`, data);
				socket.emit("STDIO_DATA", {name: game.name, data: data, type: type});
			}
		});

		game.instance[type].on('error', function (err)
		{
			if (_isRelevantData(game, err) === true)
			{
				log.error(log.getLeanLevel(), `${game.name}'s ${type} "error" event triggered:\n`, err);
				socket.emit("STDIO_ERROR", {name: game.name, error: err, type: type});
			}
		});
	}
}

function _wasDataEmittedRecently(game, data)
{
	if (assert.isArray(game.recentDataEmitted) === false)
		game.recentDataEmitted = [];

	// If data was emitted recently, don't send it again
	if (data != null && recentDataEmitted.includes(data) === true)
		return true;

	else return false;
}

function _debounceData(game, data)
{
	if (assert.isArray(game.recentDataEmitted) === false)
		game.recentDataEmitted = [];

	// Store sent data to make sure we don't keep sending it later in short intervals
	game.recentDataEmitted.push(data);

	// After a while, release the record of the previously sent data so it can be sent again if needed
	setTimeout(game.recentDataEmitted.shift, REPETITIVE_DATA_DEBOUNCER_INTERVAL);
}

function _isRelevantData(game, stdioData)
{
	const nationsTurnStatusMessageRegExp = new RegExp("^(\\(?\\*?(\\w*|\\?)(\\)|\\?|\\-|\\+)?\\s*)+$", "i");
	const serverStatusMessageRegExp = /^Setup port \d+\,/i;
	const brokenPipe = /^send\: Broken pipe/i;

	// Ignore data buffers that the game puts out
	if (stdioData.type === "Buffer")
		return false;
	
	// Nation turn status data is ignorable
	if (_wasDataEmittedRecently(stdioData) === true)
		return false;
	
	_debounceData(game, stdioData);

	if (nationsTurnStatusMessageRegExp.test(stdioData) === true ||
		serverStatusMessageRegExp.test(stdioData) === true ||
		brokenPipe.test(stdioData) === true)
		return false;

	// A timestamp used by the logger.js, this will happen
	// when the backup script executes and logs things to
	// console. Instead of sending the data to master; log it
	if (/\d\d:\d\d:\d\d\.\d\d\dZ/.test(stdioData) === true)
	{
		log.backup(log.getVerboseLevel(), stdioData);
		return false;
	}

	// Heartbeat data showing number of connections to game
	if (/^\w+,\s*Connections\s*\d+/.test(stdioData) === true)
		return false;

	return true;
}

function _getAdditionalArgs(game, isCurrentTurnRollback)
{
    let args = [
        "--nosteam",
        "--statusdump",
		"--textonly",
		..._backupCmd("--preexec", game.name), 
		..._backupCmd("--postexec", game.name)
    ];

	if (isCurrentTurnRollback === true)
		args.push("--noquickhost");
		
	if (process.platform === "win32")
        args.push("--nocrashbox");

	log.general(log.getVerboseLevel(), `Additional arguments added`, args);

	return args;
}

function _backupCmd(type, gameName)
{
	let typeName = type.slice(2);
	let backupModulePath = require.resolve("./backup_script.js");

	if (typeof backupModulePath !== "string")
	    return [];

	// Pass the dom5 flag (--preexec or --postexec) plus the cmd command to launch
	// the node script, "node [path to backup_script.js]" plus the game's name and
	// type as arguments to the script
	else return [`${type}`, `node "${backupModulePath}" ${gameName} ${typeName}`];
}
