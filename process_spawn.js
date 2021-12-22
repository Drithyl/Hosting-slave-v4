
const fs = require("fs");
const path = require("path");
const stream = require("stream");
const log = require("./logger.js");
const assert = require("./asserter.js");
const rw = require("./reader_writer.js");
const configStore = require("./config_store.js");
const spawn = require('child_process').spawn;

const REPETITIVE_DATA_DEBOUNCER_INTERVAL = 600000;
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
	const _recentDataEmitted = [];
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
		stdio: ["pipe", "pipe", "pipe"]
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

	_instance.stderr.setEncoding("utf8");
	_instance.stderr.on("data", (data) => 
	{
		// Excute the logging and emitting of the game's data asynchronously,
		// so that it won't clog the pipe. Otherwise, the pipe will end up
		// filling up because it doesn't get processed fast enough, and will
		// make the NodeJS process freeze
		setImmediate(() =>
		{
			_updateStreamPaths();
	
			if (assert.isFunction(_onStderr) === true)
				if (_isRelevantData(_recentDataEmitted, data) === true)
					_onStderr(data);
		});
	});

	_instance.stdout.setEncoding("utf8");
	_instance.stdout.on("data", (data) => 
	{
		// Excute the logging and emitting of the game's data asynchronously,
		// so that it won't clog the pipe. Otherwise, the pipe will end up
		// filling up because it doesn't get processed fast enough, and will
		// make the NodeJS process freeze
		setImmediate(() =>
		{
			_updateStreamPaths();

			if (assert.isFunction(_onStdout) === true)
				if (_isRelevantData(_recentDataEmitted, data) === true)
					_onStdout(data);
		});
	});

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

function _isRelevantData(recentDataEmitted, data)
{
	const nationsTurnStatusMessageRegExp = new RegExp("^(\\(?\\*?(\\w*|\\?)(\\)|\\?|\\-|\\+)?\\s*)+$", "i");
	const serverStatusMessageRegExp = /^Setup port \d+\,/i;
	const brokenPipe = /^send\: Broken pipe/i;

	// Ignore data buffers that the game puts out
	if (data.type === "Buffer")
		return false;
	
	if (nationsTurnStatusMessageRegExp.test(data) === true ||
		serverStatusMessageRegExp.test(data) === true ||
		brokenPipe.test(data) === true)
		return false;

	// A timestamp used by the logger.js, this will happen
	// when the backup script executes and logs things to
	// console. Instead of sending the data to master; log it
	if (/\d\d:\d\d:\d\d\.\d\d\dZ/.test(data) === true)
	{
		log.backup(log.getVerboseLevel(), data);
		return false;
	}

	// Heartbeat data showing number of connections to game
	if (/^\w+,\s*Connections\s*\d+/.test(data) === true)
		return false;

	// If data is not fully ignorable, check if it was emitted recently
	if (_wasDataEmittedRecently(recentDataEmitted, data) === true)
		return false;

	return true;
}

function _wasDataEmittedRecently(recentDataEmitted, data)
{
	const now = Date.now();
	const emittedData = recentDataEmitted.find((storedData) => storedData.content === data);

	// Data was never emitted, return false to send it
	if (emittedData == null)
	{
		// Store sent data to make sure we don't keep sending it later in short intervals
		recentDataEmitted.push({ content: data, timestamp: now });
		return false;
	}

	// Data was indeed emitted recently; less than REPETITIVE_DATA_DEBOUNCER_INTERVAL ms ago
	if (now - emittedData.timestamp < REPETITIVE_DATA_DEBOUNCER_INTERVAL)
		return true;

	// Data was emitted longer than REPETITIVE_DATA_DEBOUNCER_INTERVAL ms ago, so
	// update the timestamp to the current date and return false so it's emitted again
	emittedData.timestamp = now;
	return false;
}