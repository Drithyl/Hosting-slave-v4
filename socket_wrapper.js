
const configStore = require("./config_store.js");
const socket = (configStore.useWs === true) ? require("./ws_wrapper.js") : require("./socket_io_wrapper.js");


module.exports.connect = (...args) => socket.connect(...args);
module.exports.on = (...args) => socket.on(...args);
module.exports.emit = (...args) => socket.emit(...args);
module.exports.emitPromise = (...args) => socket.emitPromise(...args);
module.exports.connect = (...args) => socket.connect(...args);