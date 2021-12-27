
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
const assert = require("./asserter.js");
const Counter = require("./counter.js");
const configStore = require("./config_store.js");
const statusdumpFactory = require("./dom5/status_dump_wrapper.js");

const SAVEDGAMES_PATH = path.resolve(configStore.dom5DataPath, "savedgames");
const TEMP_FILES_PATH = path.resolve(configStore.dom5DataPath, configStore.tmpFilesDirName);
const STATUS_WRAPPERS_BY_NAME = {};
var _isUpdating = false;


module.exports.isUpdating = () => _isUpdating;

module.exports.populate = async () =>
{
    const gameNames = await fsp.readdir(SAVEDGAMES_PATH);

    return gameNames.forEachPromise(async (gameName, i, nextPromise) =>
    {
        log.general(log.getVerboseLevel(), `Fetching ${gameName}'s status...`);

        try
        {
            await module.exports.fetchStatus(gameName);
            log.general(log.getVerboseLevel(), `${gameName}'s status fetched!`);
            return nextPromise();
        }

        catch(err)
        {
            log.general(log.getVerboseLevel(), `${gameName}'s status could NOT be fetched!`, err);
            return nextPromise();
        }
    });
};

module.exports.startUpdateCycle = () =>
{
    if (_isUpdating === true)
        return;

    _isUpdating = true;
    setTimeout(_statusUpdateCycle, configStore.updateInterval);
};

module.exports.setOffline = (gameName) =>
{
    const status = STATUS_WRAPPERS_BY_NAME[gameName];

    if (status == null)
        return;
        
    status.counter.stop();
    status.isOnline = false;
};

module.exports.setOnline = (gameName) =>
{
    const status = STATUS_WRAPPERS_BY_NAME[gameName];

    if (status == null)
        return;
        
    status.counter.start();
    status.isOnline = true;
};

module.exports.fetchStatus = async (gameName) =>
{
    const statusdumpPath = path.resolve(SAVEDGAMES_PATH, gameName);

    if (assert.isInstanceOfPrototype(STATUS_WRAPPERS_BY_NAME[gameName], statusdumpFactory.StatusDump) === true)
        await statusWrapper.update();

    else if (STATUS_WRAPPERS_BY_NAME[gameName] == null && fs.existsSync(statusdumpPath) === true)
        STATUS_WRAPPERS_BY_NAME[gameName] = await _fetchStatus(gameName);

    if (STATUS_WRAPPERS_BY_NAME[gameName] == null)
        return Promise.reject(`No game status available for ${gameName}`);

    // Calculates uptime since last check and adds it to status wrapper sent back
    STATUS_WRAPPERS_BY_NAME[gameName].uptime = STATUS_WRAPPERS_BY_NAME[gameName].counter.getUptime();
    return Promise.resolve(STATUS_WRAPPERS_BY_NAME[gameName]);
};

module.exports.fetchPreviousTurnStatus = async (gameName) =>
{
    const clonedStatusdumpPath = path.resolve(TEMP_FILES_PATH, gameName);
    const wrapper = await statusdumpFactory.fetchStatusDump(gameName, clonedStatusdumpPath);
    return wrapper;
};

async function _statusUpdateCycle()
{
    const startTime = Date.now();
    log.general(log.getNormalLevel(), "Starting game update cycle...");

    try
    {
        const gameNames = await fsp.readdir(SAVEDGAMES_PATH);
        await Promise.allSettled(gameNames.map(_updateStatus));
        log.general(log.getNormalLevel(), `Finished game update cycle in ${Date.now() - startTime}ms`);
        setTimeout(_statusUpdateCycle, configStore.updateInterval);
    }
    
    catch(err)
    {
        log.error(log.getNormalLevel(), `Error during game update cycle`, err);
        setTimeout(_statusUpdateCycle, configStore.updateInterval);
    }
};

async function _updateStatus(gameName)
{
    log.general(log.getVerboseLevel(), `Updating ${gameName}'s status...`);
    await exports.fetchStatus(gameName);
    log.general(log.getVerboseLevel(), `${gameName}'s status updated!`);
}

async function _fetchStatus(gameName)
{
    const statusdumpPath = path.resolve(SAVEDGAMES_PATH, gameName);
    const wrapper = await statusdumpFactory.fetchStatusDump(gameName, statusdumpPath);

    // Attach a counter to the status if there isn't one already
    if (wrapper.counter == null)
        wrapper.counter = new Counter();

    return wrapper;
}