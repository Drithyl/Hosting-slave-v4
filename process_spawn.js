
const fs = require("fs");
const path = require("path");
const stream = require("stream");
const log = require("./logger.js");
const assert = require("./asserter.js");
const rw = require("./reader_writer.js");
const configStore = require("./config_store.js");
const spawn = require('child_process').spawn;

const DOM5_EXE_PATH = configStore.dom5ExePath;
const BASE_LOG_PATH = path.resolve(configStore.dataFolderPath, "logs", "games");
const MISSING_EXE_MESSAGE = `The dom5 executable path ${DOM5_EXE_PATH} does not exist!`;


if (fs.existsSync(DOM5_EXE_PATH) === false)
	throw new Error(MISSING_EXE_MESSAGE);



module.exports.SpawnedProcessWrapper = SpawnedProcessWrapper;

function SpawnedProcessWrapper(gameName, args, onSpawned)
{
    assert.isStringOrThrow(gameName);
    assert.isArrayOrThrow(args);

	// Exe must be present when spawning occurs!
	if (fs.existsSync(DOM5_EXE_PATH) === false)
		throw new Error(MISSING_EXE_MESSAGE);

	const _name = gameName;
	const _args = args;
	const _onSpawned = onSpawned;
	const _logDirPath = path.resolve(BASE_LOG_PATH, _name);

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
	const _instance = spawn(DOM5_EXE_PATH, _args, { 
		stdio: ["ignore", "pipe", "pipe"]
	});

	_instance.onProcessError = (handler) => _onError = handler;
	_instance.onProcessExit = (handler) => _onExit = handler;
	_instance.onProcessClose = (handler) => _onClose = handler;
	_instance.onProcessStderr = (handler) => _onStderr = handler;
	_instance.onProcessStdout = (handler) => _onStdout = handler;


	_instance.on("spawn", async () =>
	{
		_spawnedSuccessfully = true;
		await rw.checkAndCreateDirPath(_logDirPath);
		_updateStreamPaths();
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
		_updateStreamPaths();

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
		_instance.stdout.pipe(_stdoutWriteStream);
		_instance.stderr.pipe(_stderrWriteStream);
	}

	return _instance;
}