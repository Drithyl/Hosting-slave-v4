
// Load the variables from the .env file into process.env. More information:
// https://www.npmjs.com/package/dotenv
// https://nodejs.org/en/learn/command-line/how-to-read-environment-variables-from-nodejs
require("dotenv").config();

// Add utility methods to base types
require("./utilities/type-utilities.js").extendTypes();

const { BACKUPS_DIR_PATH } = require('./constants.js');


// Initialize all main components of the app
_initializeComponents();

async function _initializeComponents()
{
    const fs = require("fs");
    const log = require("./logger.js");
    const statusStore = require("./stores/game_status_store.js");
    const oldFilesCleaner = require("./cleaners/old_files_cleaner.js");
    const socketWrapper = require("./network/socket_wrapper.js");


    if (fs.existsSync(BACKUPS_DIR_PATH) === false)
        fs.mkdirSync(BACKUPS_DIR_PATH, { recursive: true });


    try
    {
        // Get the initial statusdump of all games, so that there is
        // never a time where the master connects here and there are
        // no statuses ready to be read from
        await statusStore.populate();

        statusStore.startUpdateCycle();
        oldFilesCleaner.startBackupCleanInterval();
        oldFilesCleaner.startLogCleanInterval();

        await socketWrapper.connect();
    }
    
    catch(err)
    {
        log.error(log.getLeanLevel(), `INITIALIZATION ERROR`, err)
    }
    

    process.on("error", (err) => log.error(log.getLeanLevel(), `PROCESS ERROR`, err));
    process.on("unhandledRejection", err => log.error(log.getLeanLevel(), `UNHANDLED REJECTION ERROR`, err));
    process.on("uncaughtException", err => log.error(log.getLeanLevel(), `UNCAUGHT EXCEPTION ERROR`, err));

    // Gracefully shut down if the process is terminated with Ctrl+C or other forceful means
    process.on("SIGINT", () =>
    {
        log.general(log.getLeanLevel(), `Gracefully shutting down...`);
        process.exit(2);
    });
}
