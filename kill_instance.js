

const killPort = require("kill-port");

module.exports = (game) => killPort(game.getPort());