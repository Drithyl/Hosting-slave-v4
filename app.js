
require("./helper_functions.js");

const fs = require("fs");
const config = require("./config.json");
const _socketWrapper = require('./socket_wrapper.js');
const masterCommands = require("./master_commands.js");
const googleDriveApi = require("./google_drive_api/index.js");


//TODO: refactor
if (fs.existsSync(`${config.dataFolderPath}/backups`) === false)
    fs.mkdirSync(`${config.dataFolderPath}/backups`);


googleDriveApi.authorize()
.then(() =>_socketWrapper.connect())
.then((connectedSocketWrapper) => masterCommands.listen(connectedSocketWrapper))
.catch((err) => console.log(`Initialization error occurred.`, err));


//will get called when an error will cause node to crash
//this way it can be properly logged
process.on("uncaughtException", (err, origin) =>
{
	let message = `\n\n####################\n\n` +
	`Caught exception:\n${err.message}\n` +
	`Exception origin:\n${origin}\n\n` +
	`Stack:\n${err.stack}\n` +
	`####################\n\n`;

	console.log(message);

	fs.appendFileSync(
		`${config.dataFolderPath}/logs/error.txt`,
		message
	);

	throw err;
});
