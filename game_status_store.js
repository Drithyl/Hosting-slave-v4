
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const log = require("./logger.js");
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

    gameNames.forEachPromise(async (gameName, i, nextPromise) =>
    {
        log.general(log.getVerboseLevel(), `Fetching ${gameName}'s status...`);

        try
        {
            await _fetchStatus(gameName);
            log.general(log.getVerboseLevel(), `${gameName}'s status fetched!`);
            return nextPromise();
        }

        catch(err)
        {
            log.general(log.getVerboseLevel(), `${gameName}'s status could NOT be fetched!`);
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

module.exports.fetchStatus = async (gameName) =>
{
    const statusdumpPath = path.resolve(SAVEDGAMES_PATH, gameName);
    var status = STATUS_WRAPPERS_BY_NAME[gameName];

    if (status == null && fs.existsSync(statusdumpPath) === true)
        status = await _fetchStatus(gameName);

    if (status == null)
        return Promise.reject(`No game status available for ${gameName}`);

    return Promise.resolve(status);
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
    const gameNames = await fsp.readdir(SAVEDGAMES_PATH);
    log.general(log.getNormalLevel(), "Starting game update cycle...");

    return gameNames.forAllPromises(async (gameName) =>
    {
        const statusWrapper = STATUS_WRAPPERS_BY_NAME[gameName];
        log.general(log.getVerboseLevel(), `Updating ${gameName}'s status...`);

        if (statusWrapper == null)
        {
            log.general(log.getVerboseLevel(), `${gameName}'s status not found, fetching...`);
            await _fetchStatus(gameName);
        }

        else
        {
            await statusWrapper.update();
            log.general(log.getVerboseLevel(), `${gameName}'s status updated!`);
        }

    }, false)
    .then(() =>
    {
        log.general(log.getNormalLevel(), `Finished game update cycle in ${Date.now() - startTime}ms`);
        setTimeout(_statusUpdateCycle, configStore.updateInterval);
    })
    .catch((err) =>
    {
        log.error(log.getNormalLevel(), `Error during game update cycle`, err);
        setTimeout(_statusUpdateCycle, configStore.updateInterval);
    });
};

async function _fetchStatus(gameName)
{
    const statusdumpPath = path.resolve(SAVEDGAMES_PATH, gameName);
    const wrapper = await statusdumpFactory.fetchStatusDump(gameName, statusdumpPath);
    STATUS_WRAPPERS_BY_NAME[gameName] = wrapper;
    return wrapper;
}