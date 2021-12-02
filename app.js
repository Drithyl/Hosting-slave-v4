
require("./helper_functions.js");
const configStore = require("./config_store.js");


configStore.createConfig()
.then(() => 
{
    configStore.loadConfig();
    _initializeComponents();
});


function _initializeComponents()
{
    const fs = require("fs");
    const log = require("./logger.js");
    const statusStore = require("./game_status_store.js");
    const socketWrapper = require('./socket_wrapper.js');
    const googleDriveApi = require("./google_drive_api/index.js");


    //TODO: refactor
    if (fs.existsSync(`${configStore.dataFolderPath}/backups`) === false)
        fs.mkdirSync(`${configStore.dataFolderPath}/backups`);


    // Get the initial statusdump of all games, so that there is
    // never a time where the master connects here and there are
    // no statuses ready to be read from
    statusStore.populate()
    .then(() => statusStore.startUpdateCycle())
    .then(() => googleDriveApi.authorize())
    .then(() => socketWrapper.connect())
    .catch((err) => log.error(log.getLeanLevel(), `INITIALIZATION ERROR`, err));

    process.on("error", (err) => log.error(log.getLeanLevel(), `PROCESS ERROR`, err));
    process.on("unhandledRejection", err => log.error(log.getLeanLevel(), `UNHANDLED REJECTION ERROR`, err));
    process.on("uncaughtException", err => log.error(log.getLeanLevel(), `UNCAUGHT EXCEPTION ERROR`, err));

    // Gracefully shut down if the process is terminated with Ctrl+C or other forceful means
    process.on("SIGINT", () =>
    {
        log.general(log.getLeanLevel(), `Gracefully shutting down...`);
        
        return log.dumpToFile()
        .then(() => 
        {
            // Graceful shutdown
            process.exit("SIGINT");
        });
    });
}
