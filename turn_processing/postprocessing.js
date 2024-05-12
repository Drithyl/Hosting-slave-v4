
const dotenv = require('dotenv');
dotenv.config();

const GAME_NAME = process.argv[2];
const GAME_TYPE = process.argv[3];

// Disable all console logging during backup, as it will otherwise be passed
// to the parent node process as if it was stdout data from dom
process.env.LOG_TO_CONSOLE = false;

require("./base_processing.js").postprocessing(GAME_NAME, GAME_TYPE);
