

const killPort = require("kill-port");

module.exports = (game) => 
{
    return killPort(game.getPort())
    .catch((err) => Promise.reject(new Error(`Could not kill ${game.getName()}; can't do the port transfer. Try again later.`)));
};