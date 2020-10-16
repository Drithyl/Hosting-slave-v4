
require("./helper_functions.js");

const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const downloader = require("./file_downloader.js");
const hoster = require("./reserved_ports_store.js");
const gameStore = require("./hosted_games_store.js");
const dom5Interface = require("./dom5_interface.js");

/****************************************
*   SOCKET CONNECTION TO MASTER SERVER  *
****************************************/
var io = require('socket.io-client');
var socket = io.connect(`http://${config.masterIP}:${config.masterPort}/`,
{
	reconnection: true
});

/************************************
*   MASTER SERVER AUTHENTICATION    *
************************************/
//This is called by the master server once it receives the socket connection,
//to verify that this server is trusted by using the token.
socket.on("REQUEST_SERVER_DATA", function(data, serverCb)
{
	rw.log("general", "Received REQUEST_SERVER_DATA event from master server. Sending authentication attempt.");
	serverCb({
	  id: config.id, 
	  capacity: config.capacity, 
	  ownerDiscordID: config.ownerDiscordID
	});
});

//Received when the master server validates the authentication,
//at which point we can launch games.
socket.on("GAME_DATA", function(gamesInfo, serverCb)
{
	rw.log("general", "Authentication attempt validated by master server.");

	if (typeof gamesInfo !== "object")
	{
	  rw.log("error", `Did not receive any game data from master server:`, gamesInfo);
	  gameStore.populate({}, serverCb);
	}

	else gameStore.populate(gamesInfo, serverCb);
});

rw.log("general", "Set up listeners for master server's 'init' event.");


/******************************
*   DISCONNECTION HANDLING    *
******************************/
socket.on("disconnect", function(reason)
{
	rw.log("general", `Socket disconnected. Reason: ${reason}.`);

	//release all reserved ports in assisted hosting instances,
	//because if it's the master server that crashed, when it comes back up
	//the ports will be reserved for no instance
	hoster.releaseAllPorts();

	/*rw.log(`general`, "Shutting down games...");
	gameStore.killAllGames(function()
	{
	  rw.log(`general`, "Finished shutting down games.");
	});*/

	rw.log(`general`, "Freezing games...");
	gameStore.freezeGames(function()
	{
	  rw.log(`general`, "Finished freezing games.");
	});

	if (reason === "io server disconnect")
	{
	  //reconnect if the server dropped the connection
	  socket.connect();
	}

	//if the reason is "io client disconnect", the socket will try to
	//reconnect automatically, since the reconnection flag in the socket
	//original connection is true
});

/****************************
*   RECONNECTION HANDLING   *
****************************/
socket.on("reconnect", function(attemptNumber)
{
	//no need to relaunch games here as the authentication process will kick in again
	//from the very beginning, on connection, when the master server sends the "init" event
	rw.log("general", `Reconnected successfully on attempt ${attemptNumber}.`);
});

socket.on("reconnect_attempt", function(attemptNumber)
{
	//rw.log("general", `Attempting to reconnect...`);

	if (attemptNumber > 5)
	{
	  //rw.log("general", "Unable to reconnect after 5 tries; shutting down games for safety.");
	}
});

socket.on("reconnect_error", function(attemptNumber)
{
	//rw.log("general", `Reconnect attempt failed.`);
});

//fired when it can't reconnect within reconnectionAttempts
socket.on("reconnect_failed", function()
{
	//rw.log("general", `Could not reconnect to the master server after all the set reconnectionAttempts.`);
});

/*********************************
*   ASSISTED HOSTING FUNCTIONS   *
*********************************/
socket.on("RESERVE_PORT", function(data, serverCb)
{
	rw.log("general", `Request to reserve port received.`);
	hoster.reservePort(serverCb);
});

socket.on("RELEASE_PORT", function(data)
{
	rw.log("general", `Request to release port received.`);
	hoster.releasePort(data.port);
});

socket.on("IS_GAME_NAME_FREE", function(data, serverCb)
{
	rw.log("general", `Request to check game name <${data.name}> from user id <${data.id}> received.`);
	gameStore.isGameNameUsed(data.name, serverCb);
});

socket.on("VERIFY_MAP", function(mapFilename, serverCb)
{
	rw.log("general", `Request to validate mapfile <${mapFilename}> received.`);
	hoster.validateMapfile(mapFilename, serverCb);
});

socket.on("VERIFY_MODS", function(modFilenames, serverCb)
{
	rw.log("general", `Request to validate mods <${modFilenames}> received.`);
	hoster.validateMods(modFilenames, serverCb);
});


/******************************************************
*           DOWNLOAD MAP AND MODS FUNCTIONS           *
* The Google Drive api will be used for this purpose  *
******************************************************/

socket.on("DOWNLOAD_MAP", function(data, serverCb)
{
	if (typeof data.fileId !== "string")
	  return serverCb(new Error("fileId must be specified."));

	//confirm that request is valid
	serverCb();

	rw.log("upload", `Request to download map zipfile ${data.fileId} received.`);

	downloader.downloadMap(data.fileId)
	.then((filesWritten) => serverCb(null, filesWritten))
	.catch((err) => serverCb(err.message));
});

socket.on("DOWNLOAD_MOD", function(data, serverCb)
{
	if (typeof data.fileId !== "string")
	  return serverCb(new Error("fileId must be specified."));

	//confirm that request is valid
	serverCb();

	rw.log("upload", `Request to download mod zipfile ${data.fileId} received.`);

	downloader.downloadMod(data.fileId)
	.then((filesWritten) => serverCb(null, filesWritten))
	.catch((err) => serverCb(err.message));
});


/********************************************
*             GAME FUNCTIONS                *
********************************************/

socket.on("ONLINE_CHECK", function(port, serverCb)
{
	serverCb(null, gameStore.isGameOnline(port));
});

socket.on("CREATE_GAME", function(data, serverCb)
{
	gameStore.create(data.name, data.port, data.gameType, data.args, serverCb);
});

socket.on("LAUNCH_GAME", function(gameData, serverCb)
{
	console.log(`Request to launch game ${gameData.name} received.`);
	gameStore.requestHosting(gameData, serverCb);
});

socket.on("KILL_GAME", function(gameData, serverCb)
{
	console.log(`Request to kill game ${gameData.name} received.`);
	gameStore.killGame(gameData.port, serverCb);
});

socket.on("DELETE_GAME_SAVEFILES", function(data, serverCb)
{
	gameStore.deleteGameSavefiles(data, serverCb);
});

socket.on("GET_LAST_HOSTED_TIME", function(data, serverCb)
{
	dom5Interface.getLastHostedTime(data, serverCb);
});

socket.on("DELETE_GAME_DATA", function(data, serverCb)
{
	gameStore.deleteGameData(data, serverCb);
});

socket.on("GET_MOD_LIST", function(data, serverCb)
{
	dom5Interface.getModList(serverCb);
});

socket.on("GET_MAP_LIST", function(data, serverCb)
{
	dom5Interface.getMapList(serverCb);
});

socket.on("GET_TURN_FILE", function(data, serverCb)
{
	dom5Interface.getTurnFile(data, serverCb);
});

socket.on("GET_SCORE_DUMP", function(data, serverCb)
{
	dom5Interface.getScoreDump(data, serverCb);
});

socket.on("OVERWRITE_SETTINGS", function(data, serverCb)
{
	gameStore.overwriteSettings(data, serverCb);
});

socket.on("START_GAME", function(data, serverCb)
{
	dom5Interface.start(data, serverCb);
});

socket.on("RESTART_GAME", function(data, serverCb)
{
	dom5Interface.restart(data, serverCb);
});

socket.on("BACKUP_SAVEFILES", function(data, serverCb)
{
	dom5Interface.backupSavefiles(data, serverCb);
});

socket.on("ROLLBACK", function(data, serverCb)
{
	dom5Interface.rollback(data, serverCb);
});

socket.on("GET_STALES", function(data, serverCb)
{
	dom5Interface.getStales(data, serverCb);
});

socket.on("GET_SUBMITTED_PRETENDERS", function(data, serverCb)
{
	dom5Interface.getSubmittedPretenders(data, serverCb);
});

socket.on("REMOVE_PRETENDER", function(data, serverCb)
{
	dom5Interface.removePretender(data, serverCb);
});

socket.on("GET_DUMP", function(data, serverCb)
{
	dom5Interface.getDump(data, serverCb);
});


//will get called when an error will cause node to crash
//this way it can be properly logged
process.on("uncaughtException", (err, origin) =>
{
	let message = `\n\n####################\n\n` +
	`Caught exception:\n${err}\n` +
	`Exception origin:\n${origin}\n\n` +
	`####################\n\n`;

	console.log(message);
	console.trace();

	fs.appendFileSync(
		config.errorLogPath,
		message
	);

	throw err;
});
