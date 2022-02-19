
const configStore = require("./config_store.js");

if (configStore.useWs === true)
{
    module.exports = require("./ws_wrapper.js");
}

else
{
    module.exports = require("./socket_io_wrapper.js");
}