
require("./helper_functions.js");
const configHelper = require("./config_helper.js");


Promise.resolve()
.then(() =>
{
    // Set up config by asking user in console
    if (configHelper.hasConfig() === false)
        return configHelper.askConfigQuestions();

    else return Promise.resolve();
})
.then(() =>
{
    // Load config and then begin initialization
    config = configHelper.buildDataPath();


    _initializeComponents();
});


function _initializeComponents()
{
    const fs = require("fs");
    const config = require("./config.json");
    const log = require("./logger.js");
    const _socketWrapper = require('./socket_wrapper.js');
    const googleDriveApi = require("./google_drive_api/index.js");


    //TODO: refactor
    if (fs.existsSync(`${config.dataFolderPath}/backups`) === false)
        fs.mkdirSync(`${config.dataFolderPath}/backups`);


    googleDriveApi.authorize()
    .then(() => _socketWrapper.connect())
    .catch((err) => log.error(log.getLeanLevel(), `INITIALIZATION ERROR`, err));

    process.on("uncaughtException", err => log.error(log.getLeanLevel(), `UNCAUGHT EXCEPTION`, err));
}
