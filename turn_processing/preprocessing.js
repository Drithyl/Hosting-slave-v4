
// Disable all console logging during backup, as it will otherwise be passed
// to the parent node process as if it was stdout data from dom5
process.env.LOG_TO_CONSOLE = false;
const GAME_NAME = process.argv[2];

require("./base_processing.js").preprocessing(GAME_NAME);
