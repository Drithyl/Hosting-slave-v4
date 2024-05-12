
const socket = require("./ws_wrapper.js");


module.exports.connect = (...args) => socket.connect(...args);
module.exports.on = (...args) => socket.on(...args);
module.exports.emit = (...args) => socket.emit(...args);
module.exports.emitPromise = (...args) => socket.emitPromise(...args);
module.exports.connect = (...args) => socket.connect(...args);