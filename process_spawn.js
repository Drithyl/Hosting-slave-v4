
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const spawn = require('child_process').spawn;
const socket = require("./socket_wrapper.js");
const stream = require("stream");

//BEWARE: do not try to pass a master server callback directly to the function or
//the returning instance will cause a RangeError: Maximum call stack size exceeded
//as it is an object that contains circular references
module.exports.spawn = function(game)
{
	const path = config.dom5ExePath;

	//Arguments must be passed in an array with one element at a time. Even a flag like
	//--mapfile needs to be its own element, followed by a separate element with its value,
	//i.e. peliwyr.map
	const finalArgs = _getAdditionalArgs(game).concat([...game.args]);

	if (fs.existsSync(path) === false)
		return Promise.reject(`The path ${path} is incorrect. Cannot host game ${game.name} (${game.gameType}).`);

	if (finalArgs == null)
		return Promise.reject(`No args were provided to host the game ${game.name} (${game.gameType}).`);

	//instances get overloaded if they spent ~24h with their stdio being listened to,
	//and end up freezing (in windows server 2012), according to tests in previous bot versions
	//TODO: testing not ignoring the stdio again
    game.instance = spawn(path, finalArgs, { stdio: "pipe" });
    game.isRunning = true;

	_attachOnExitListener(game);
	_attachOnCloseListener(game);
	_attachOnErrorListener(game);
	_attachStdioListener("stderr", game);
	_attachStdioListener("stdin", game);
	_attachStdioListener("stdout", game);

	rw.log("general", `Process for ${game.name} spawned.`);
	return Promise.resolve(game);
};

function _attachOnExitListener(game)
{
	//Fires when the process itself exits. See https://nodejs.org/api/child_process.html#child_process_event_exit
	game.instance.on("exit", (code, signal) =>
	{
        game.isRunning = false;

		//If process exited, code is its final code and signal is null;
		//if it was terminated due to a signal, then code is null.
		if (signal === "SIGKILL" || signal === "SIGTERM" || signal === "SIGINT")
		{
			rw.log(["general"], `${game.name}'s was terminated by ${signal}.`);
		}

		else if (code === 0)
		{
			rw.log(["general"], `${game.name}'s exited without errors (perhaps port was already in use).`);
		}

		else if (signal == null)
		{
			rw.log(["error"], `${game.name}'s "exit" event triggered. Maybe an ingame error occurred, or an arg made it crash. Try launching it without the --notext flag:\n`, {port: game.port, args: game.args, code: code, signal: signal});
			socket.emit("GAME_EXITED", {name: game.name, code: code});
		}

		//SIGKILL would mean that the kill_instance.js code was called, so it's as expected
		else if (game.instance.killed === false && signal !== "SIGKILL")
		{
			rw.log(["error"], `${game.name}'s "exit" event triggered. Process was abnormally terminated:\n`, {signal: signal});
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
			rw.log(["general"], `${game.name}'s stdio got closed by ${signal}.`);
		}

		else if (code === 0)
		{
			rw.log(["general"], `${game.name}'s stdio got closed with code 0.`);
		}

		//code 0 means there were no errors. If instance is null, then "exit" above
		//must have run already, so don't ping the master server again
		if (game.instance != null && game.instance.killed === false && code !== 0)
		{
			socket.emit("STDIO_CLOSED", {name: game.name, code: code, signal: signal});
			rw.log(["general"], `${game.name}'s stdio closed:\n`, {port: game.port, args: game.args, code: code, signal: signal});
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
		rw.log("error", `${game.name}'s "error" event triggered.`, err);
		socket.emit("GAME_ERROR", {name: game.name, error: err.message});
	});
}

function _attachStdioListener(type, game)
{
	//dom instances print stdout very often. This is probably what leads to buffer
	//overflow and the instances hanging when it's not being ignored nor caught
	if (game.instance[type] != null)
	{
        const writeStream = new stream.Writable();

        writeStream._write = (data) => 
        {
            console.log(`${game.name}\t${data}`);
            socket.emit("STDIO_DATA", {name: game.name, data: data, type: type});
        };

        game.instance[type].setEncoding("utf8");
        game.instance[type].pipe(writeStream);
        console.log(`Listening to ${game.name}'s ${type} stream.`);

		game.instance[type].on('data', function (data)
		{
			rw.log(["general"], `${game.name}'s ${type} "data" event triggered:\n`, data);
			socket.emit("STDIO_DATA", {name: game.name, data: data, type: type});
		});

		game.instance[type].on('error', function (err)
		{
			rw.log(["error"], `${game.name}'s ${type} "error" event triggered:\n`, err);
			socket.emit("STDIO_ERROR", {name: game.name, error: err, type: type});
		});
	}
}

function _getAdditionalArgs(game)
{
    let args = [
        "--nosteam",
        "--statusdump",
		"--textonly",
		..._backupCmd("--preexec", game.name), 
		..._backupCmd("--postexec", game.name)
    ];
		
	if (process.platform === "win32")
        args.push("--nocrashbox");

	return args;
}

function _backupCmd(type, gameName)
{
	let backupModulePath = require.resolve("./backup_script.js");

	if (typeof backupModulePath !== "string")
	    return [];

	//pass the dom5 flag (--preexec or --postexec) plus the cmd command to launch
	//the node script, "node [path to backup_script.js]" plus the game's name and
	//type as arguments to the script
	else return [type, `node "${backupModulePath}" ${gameName} ${type}`];
}
