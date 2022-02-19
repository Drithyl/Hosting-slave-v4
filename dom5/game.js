
const log = require("../logger.js");
const assert = require("../asserter.js");
const socketWrapper = require("../socket_wrapper.js");
const statusStore = require("../game_status_store.js");
const { SpawnedProcessWrapper } = require("../process_spawn.js");

module.exports = Game;

function Game(name, port, args)
{
    assert.isStringOrThrow(name);
    assert.isIntegerOrThrow(port);
    assert.isArrayOrThrow(args);

    const _name = name;
    var _port = port;
    var _args = args.concat(_addAdditionalArgs(_name));
    var _process;
    var _isOnline = false;

    this.getName = () => _name;
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
            _args = newArgs.concat(_addAdditionalArgs(_name));
    };

    this.launchProcess = () => _spawn(_args);
    this.launchProcessWithRollbackedTurn = () => _spawn(["--noquickhost", ..._args]);

    function _spawn(args)
    {
        return new Promise((resolve, reject) =>
        {
            _process = new SpawnedProcessWrapper(_name, args, (err) =>
            {
                if (err)
                    return reject(err);

                _isOnline = true;
                statusStore.updateGameCounterStatus(_name);
                return resolve();
            });
    
            _setProcessListeners();
        });
    }

    function _setProcessListeners()
    {
        _process.onProcessClose((code, signal) => {
            _isOnline = false;
            statusStore.updateGameCounterStatus(_name);
            log.general(log.getNormalLevel(), `${_name} at ${_port}: Closed with code ${code} and signal ${signal}`);
        });

        _process.onProcessExit((code, signal) => {
            _isOnline = false;
            statusStore.updateGameCounterStatus(_name);
            log.general(log.getNormalLevel(), `${_name} at ${_port}: Exited with code ${code} and signal ${signal}`);
        });

        _process.onProcessError((err) => {
            log.general(log.getNormalLevel(), `${_name} at ${_port}: Process error occurred`, err);
            socketWrapper.emit("GAME_ERROR", { name: _name, error: err.message });
        });

        _process.onProcessStderr((data) => {
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
function _addAdditionalArgs(gameName)
{
    let args = [
        "--nosteam",
        "--statusdump",
		"--textonly",
		..._backupCmd("--preexec", gameName), 
		..._backupCmd("--postexec", gameName)
    ];
		
	if (process.platform === "win32")
        args.push("--nocrashbox");

	return args;
}

function _backupCmd(type, gameName)
{
	let typeName = type.slice(2);
	let backupModulePath = require.resolve("../backup_script.js");

	if (typeof backupModulePath !== "string")
	    return [];

	// Pass the dom5 flag (--preexec or --postexec) plus the cmd command to launch
	// the node script, "node [path to backup_script.js]" plus the game's name and
	// type as arguments to the script
	else return [`${type}`, `node "${backupModulePath}" ${gameName} ${typeName}`];
}