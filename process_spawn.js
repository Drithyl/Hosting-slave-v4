
const fs = require("fs");
const path = require("path");
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
	const _stdoutLogPath = path.resolve(BASE_LOG_PATH, _name);
	const _stderrLogPath = path.resolve(BASE_LOG_PATH, _name);

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


	_instance.on("spawn", () =>
	{
		_spawnedSuccessfully = true;
		_pipeToLog(_instance.stdout, _stdoutLogPath, "stdout.txt");
		_pipeToLog(_instance.stderr, _stderrLogPath, "stderr.txt");
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
		if (assert.isFunction(_onStderr) === true)
			if (_isRelevantData(_recentDataEmitted, data) === true)
				_onStderr(data)
	});

	_instance.stdout.setEncoding("utf8");
	_instance.stdout.on("data", (data) => 
	{
		if (assert.isFunction(_onStdout) === true)
			if (_isRelevantData(_recentDataEmitted, data) === true)
				_onStdout(data)
	});

	return _instance;
}

// Pipes one of the child's streams to a given file with the current date attached;
// This will create new files every day so they are easy to go and read from
async function _pipeToLog(readable, dirPath, filename)
{
	const date = new Date();
	const finalPath = path.resolve(dirPath, `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}-${filename}`);
	await rw.checkAndCreateFilePath(finalPath);
	readable.pipe(fs.createWriteStream(finalPath, { flags: "a" }));
}

function _isRelevantData(recentDataEmitted, stdioData)
{
	const nationsTurnStatusMessageRegExp = new RegExp("^(\\(?\\*?(\\w*|\\?)(\\)|\\?|\\-|\\+)?\\s*)+$", "i");
	const serverStatusMessageRegExp = /^Setup port \d+\,/i;
	const brokenPipe = /^send\: Broken pipe/i;

	// Ignore data buffers that the game puts out
	if (stdioData.type === "Buffer")
		return false;
	
	// Nation turn status data is ignorable
	if (_wasDataEmittedRecently(recentDataEmitted, stdioData) === true)
		return false;
	
	_debounceData(recentDataEmitted, stdioData);

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

function _wasDataEmittedRecently(recentDataEmitted, data)
{
	// If data was emitted recently, don't send it again
	if (data != null && recentDataEmitted.includes(data) === true)
		return true;

	else return false;
}

function _debounceData(recentDataEmitted, data)
{
	// Store sent data to make sure we don't keep sending it later in short intervals
	recentDataEmitted.push(data);

	// After a while, release the record of the previously sent data so it can be sent again if needed
	setTimeout(recentDataEmitted.shift, REPETITIVE_DATA_DEBOUNCER_INTERVAL);
}