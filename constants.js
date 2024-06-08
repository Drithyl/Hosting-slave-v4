const path = require("path");

const DATA_DIR_NAME = "data";
const DATA_DIR_PATH = path.resolve(DATA_DIR_NAME);

const CLONED_STATUSDUMP_DIR_NAME = "statusdumps";

const TMP_DIR_NAME = "tmp";
const TMP_DIR_PATH = path.resolve(DATA_DIR_PATH, TMP_DIR_NAME);

const LOGS_DIR_NAME = "logs";
const LOGS_DIR_PATH = path.resolve(DATA_DIR_PATH, LOGS_DIR_NAME);

const GAME_LOGS_DIR_NAME = "games";
const GAME_LOGS_DIR_PATH = path.resolve(LOGS_DIR_PATH, GAME_LOGS_DIR_NAME);

const BACKUPS_DIR_NAME = "backups";
const BACKUPS_DIR_PATH = path.resolve(DATA_DIR_NAME, BACKUPS_DIR_NAME);

const PRE_EXEC_BACKUP_DIR_NAME = "pre";
const POST_EXEC_BACKUP_DIR_NAME = "post";

const DOM5_GAME_TYPE_NAME = "dom5";
const DOM6_GAME_TYPE_NAME = "dom6";

const DOMCMD_FILE_NAME = "domcmd";


module.exports = Object.freeze({
    DATA_DIR_NAME,
    DATA_DIR_PATH,
    CLONED_STATUSDUMP_DIR_NAME,
    TMP_DIR_NAME,
    TMP_DIR_PATH,
    LOGS_DIR_NAME,
    LOGS_DIR_PATH,
    GAME_LOGS_DIR_NAME,
    GAME_LOGS_DIR_PATH,
    BACKUPS_DIR_NAME,
    BACKUPS_DIR_PATH,
    PRE_EXEC_BACKUP_DIR_NAME,
    POST_EXEC_BACKUP_DIR_NAME,
    DOM5_GAME_TYPE_NAME,
    DOM6_GAME_TYPE_NAME,
    DOMCMD_FILE_NAME
});
