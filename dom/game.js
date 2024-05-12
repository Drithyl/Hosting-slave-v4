
const log = require("../logger.js");
const assert = require("../utilities/type-utilities.js");
const socketWrapper = require("../network/socket_wrapper.js");
const statusStore = require("../game_status_store.js");
const { DominionsProcess } = require("./DominionsProcess.js");

module.exports = Game;

function Game(name, type, port, args)
{
    assert.isStringOrThrow(name);
    assert.isIntegerOrThrow(port);
    assert.isArrayOrThrow(args);

    const _name = name;
    const _type = type;
    var _port = port;
    var _args = args.concat(_addAdditionalArgs(_name, _type));
    var _process;
    var _isOnline = false;

    this.getName = () => _name;
    this.getType = () => _type;
    this.getPort = () => _port;
    this.getArgs = () => _args;
    this.getProcess = () => _process;
    this.isOnline = () => _isOnline;

    this.setPort = (newPort) => 
    {
        if (assert.isInteger(newPort) === true)
            _port = newPort;
    };

    this.setArgs = (newArgs) =>
    {
        if (assert.isArray(newArgs) === true)
            _args = newArgs.concat(_addAdditionalArgs(_name, _type));
    };

    this.launchProcess = () => _spawn(_args);
    this.launchProcessWithRollbackedTurn = () => _spawn(["--noquickhost", ..._args]);

    function _spawn(args)
    {
        return new Promise((resolve, reject) =>
        {
            _process = new DominionsProcess(_name, _type, args, (err) =>
            {
                if (err)
                    return reject(err);

                _isOnline = true;
                statusStore.updateGameCounterStatus(_name, _type);
                return resolve();
            });
    
            _setProcessListeners();
        });
    }

    function _setProcessListeners()
    {
        _process.onProcessClose((code, signal) => {
            _isOnline = false;
            statusStore.updateGameCounterStatus(_name, _type);
            socketWrapper.emit("GAME_CLOSED", { name: _name, code, signal });
            log.general(log.getNormalLevel(), `${_name} at ${_port}: Closed with code ${code} and signal ${signal}`);
        });

        _process.onProcessExit((code, signal) => {
            statusStore.updateGameCounterStatus(_name, _type);
            log.general(log.getNormalLevel(), `${_name} at ${_port}: Exited with code ${code} and signal ${signal}`);
        });

        _process.onProcessError((err) => {
            log.general(log.getNormalLevel(), `${_name} at ${_port}: Process error occurred`, err);
            socketWrapper.emit("GAME_ERROR", { name: _name, error: err.message });
        });

        _process.onProcessStderr((data) => {
            log.general(log.getNormalLevel(), `${_name} at ${_port} STDERR DATA`, data);
            socketWrapper.emit("STDIO_DATA", { name: _name, data, type: "stderr" });
        });

        _process.onProcessStdout((data) => {
            socketWrapper.emit("STDIO_DATA", { name: _name, data, type: "stdout" });
        });
    }
}

Game.areSameSettings = (gameA, gameB) =>
{
    if (gameA.getName() !== gameB.getName())
        return false;

    return _areArgsEqual(gameA.getArgs(), gameB.getArgs());
};

function _areArgsEqual(argsA, argsB)
{
    var sortedArgs = [...argsA];
    var theseSortedArgs = [...argsB];

    if (argsA === argsB) return true;
    if (argsA == null || argsB == null) return false;
    if (argsA.length !== argsB.length) return false;

    sortedArgs = sortedArgs.sort((a, b) => a - b);
    theseSortedArgs = theseSortedArgs.sort((a, b) => a - b);

    for (var i = 0; i < sortedArgs.length; ++i)
        if (sortedArgs[i] !== theseSortedArgs[i])
            return false;

    return true;
}


// Arguments must be passed in an array with one element at a time. Even a flag like --mapfile
// needs to be its own element, followed by a separate element with its value, i.e. peliwyr.map
function _addAdditionalArgs(gameName, gameType)
{
    let args = [
        "--nosteam",
        "--statusdump",
		"--textonly",
		..._preExecCmd(gameName, gameType),
		..._postExecCmd(gameName, gameType)
    ];
		
	if (process.platform === "win32")
        args.push("--nocrashbox");

	return args;
}

function _preExecCmd(gameName, gameType)
{
	let preprocessor = require.resolve("../turn_processing/preprocessing.js");

	if (typeof preprocessor !== "string")
	    return [];

    // Pass the dom flag (--preexec or --postexec) plus the cmd
    // command to launch the node script, "node [path to backup_script.js]" 
    // plus the game's name as argument
    return ["--preexec", `node "${preprocessor}" ${gameName} ${gameType}`];
}

function _postExecCmd(gameName, gameType)
{
	let postprocessor = require.resolve("../turn_processing/postprocessing.js");

	if (typeof postprocessor !== "string")
	    return [];
    
    // Pass the dom flag (--preexec or --postexec) plus the cmd
    // command to launch the node script, "node [path to backup_script.js]" 
    // plus the game's name as argument
    return ["--postexec", `node "${postprocessor}" ${gameName} ${gameType}`];
}