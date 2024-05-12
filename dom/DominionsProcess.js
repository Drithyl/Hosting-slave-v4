
const fs = require("fs");
const fsp = fs.promises;
const path = require("path");
const stream = require("stream");
const assert = require("../utilities/type-utilities.js");
const rw = require("../utilities/file-utilities.js");
const spawn = require("child_process").spawn;
const { getDominionsExePath } = require("../utilities/path-utilities.js");
const { DOM5_GAME_TYPE_NAME, DOM6_GAME_TYPE_NAME, LOGS_DIR_PATH } = require("../constants.js");


// Ensure both Dominions executables exist
_validateExecutablePath(DOM5_GAME_TYPE_NAME);
_validateExecutablePath(DOM6_GAME_TYPE_NAME);


module.exports = DominionsProcess;

function DominionsProcess(gameName, gameType, args, onSpawned)
{
    assert.isStringOrThrow(gameName);
    assert.isValidGameTypeOrThrow(gameType);
    assert.isArrayOrThrow(args);

	// Exe must be present when spawning occurs!
	_validateExecutablePath(gameType);

	const _name = gameName;
	const _type = gameType;
	const _exePath = getDominionsExePath(_type);
	const _args = args;
	const _onSpawned = onSpawned;
	const _logDirPath = path.resolve(LOGS_DIR_PATH, _name);

	var dayOfMonth = new Date().getDate();
	var _stdoutWriteStream;
	var _stderrWriteStream;

	var _spawnedSuccessfully = false;
	var _onError;
	var _onExit;
	var _onClose;
	var _onStderr;
	var _onStdout;


	// Stdio pipes are not ignored by default. If these pipes are not listened to (with .on("data") or .pipe())
	// in flowing mode, or periodically read from in paused mode and consuming the data chunks, the instance
	// will eventually hang, as the pipes will fill up and Dominions won't be able to push out more data.
	// This makes the games remain running but unable to be connected, hanging at "Waiting for info..."
	// https://nodejs.org/api/stream.html#stream_class_stream_readable
	// stdio array is [stdin, stdout, stderr]
	const _instance = spawn(_exePath, _args, { 
		//stdio: ["ignore", "ignore", "pipe"]
		// TODO: temporary while I think of a solution to games freezing up
		// (or the bot when all data is sent to it)
		stdio: ["ignore", "ignore", "pipe"]
	});

	_instance.onProcessError = (handler) => _onError = handler;
	_instance.onProcessExit = (handler) => _onExit = handler;
	_instance.onProcessClose = (handler) => _onClose = handler;
	_instance.onProcessStderr = (handler) => _onStderr = handler;
	_instance.onProcessStdout = (handler) => _onStdout = handler;


	_instance.on("spawn", async () =>
	{
		_spawnedSuccessfully = true;

		if (fs.existsSync(_logDirPath) === false)
			await fsp.mkdir(_logDirPath, { recursive: true });

		//_updateStreamPaths();
		onSpawned();
	});

	_instance.on("error", (err) => 
	{
		if (_spawnedSuccessfully === false)
			_onSpawned(err);
			
		else if (assert.isFunction(_onError) === true)
			_onError(err)
	});

	_instance.on("exit", (code, signal) => 
	{
		if (assert.isFunction(_onExit) === true)
			_onExit(code, signal)
	});

	_instance.on("close", (code, signal) => 
	{
		if (assert.isFunction(_onClose) === true)
			_onClose(code, signal)
	});

	if (_instance.stderr != null)
	{
		// Stderr pipe (usually errors are received here)
		_instance.stderr.setEncoding("utf8");
		_instance.stderr.on("error", (err) => _handleData(_onStderr, err));
		_instance.stderr.on("data", (data) => _handleData(_onStderr, data));
	}

	if (_instance.stdout != null)
	{
		// Stdout pipe (usually more ignorable data is received here, like heartbeats)
		_instance.stdout.setEncoding("utf8");
		_instance.stdout.on("error", (err) => _handleData(_onStdout, err));
		_instance.stdout.on("data", (data) => _handleData(_onStdout, data));
	}

	
	// Update pipe streams if needed, and pass data onto the game's handler
	function _handleData(handler, data)
	{
		//_updateStreamPaths();

		if (assert.isFunction(handler) === true)
			handler(data);
	}


	// Checks the current date and compares it to the last stored day. If it's a new day,
	// will destroy the old pipes and create new ones with a new path for a new date.
	function _updateStreamPaths()
	{
		const date = new Date();
		const day = date.getDate();

		if (dayOfMonth === day && 
			assert.isInstanceOfPrototype(_stdoutWriteStream, stream.Writable) === true && 
			assert.isInstanceOfPrototype(_stderrWriteStream, stream.Writable) === true)
			return;

		dayOfMonth = day;

		if (_stdoutWriteStream != null && _stdoutWriteStream.destroyed === false)
			_stdoutWriteStream.destroy();

		if (_stderrWriteStream != null && _stderrWriteStream.destroyed === false)
			_stderrWriteStream.destroy();

		_stdoutWriteStream = fs.createWriteStream(path.resolve(_logDirPath, `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-stdout.txt`), { flags: "a", autoClose: true });
		_stderrWriteStream = fs.createWriteStream(path.resolve(_logDirPath, `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-stderr.txt`), { flags: "a", autoClose: true });

		if (_instance.stdout != null)
			_instance.stdout.pipe(_stdoutWriteStream);

		if (_instance.stderr != null)
			_instance.stderr.pipe(_stderrWriteStream);
	}

	return _instance;
}

function _validateExecutablePath(gameType) {
	const exePath = getDominionsExePath(gameType);

	if (fs.existsSync(exePath) === false)
		throw new Error(`The dom executable path ${exePath} does not exist!`);
}