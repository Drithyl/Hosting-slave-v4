
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const assert = require("../asserter.js");
const rw = require("../reader_writer.js");
const configStore = require("../config_store.js");
const NationStatusWrapper = require("./nation_status_wrapper.js");

const STATUSDUMP_FILENAME = "statusdump.txt";


exports.fetchStatusDump = async (gameName, filePath = null) =>
{
    const gameDataPath = path.resolve(configStore.dom5DataPath, `savedgames/${gameName}`);
    const statusDumpPath = (assert.isString(filePath) === false) ? path.resolve(gameDataPath, STATUSDUMP_FILENAME) : path.resolve(filePath, STATUSDUMP_FILENAME);

    if (fs.existsSync(statusDumpPath) === false)
        throw new Error(`Could not find ${gameName}'s statusdump at path ${statusDumpPath}`);

    // Create wrapper object then update it to parse the latest statusdump data
    const wrapper = new StatusDump(gameName, statusDumpPath);
    await wrapper.update();
    return wrapper;
};

exports.cloneStatusDump = (gameName, targetPath, sourcePath = null) =>
{
    const gameDataPath = `${configStore.dom5DataPath}/savedgames/${gameName}`;
    const statusDumpPath = (assert.isString(sourcePath) === false) ? `${gameDataPath}/${STATUSDUMP_FILENAME}` : sourcePath;

    if (fs.existsSync(targetPath) === false)
        return Promise.reject(new Error(`Target path ${targetPath} does not exist.`));

    if (fs.existsSync(statusDumpPath) === false)
        return Promise.reject(new Error(`Could not find ${gameName}'s statusdump.`));

    return rw.copyFile(statusDumpPath, `${targetPath}/${STATUSDUMP_FILENAME}`)
    .catch((err) => Promise.reject(new Error(`Could not clone statusdump:\n\n${err.message}`)));
};

exports.StatusDump = StatusDump;

function StatusDump(gameName, originalPath)
{
    assert.isStringOrThrow(gameName);
    assert.isStringOrThrow(originalPath);

    const _gameName = gameName;
    const _originalPath = originalPath;
    
    this.lastUpdateTimestamp = 0;
    this.turnNbr = -1;
    this.eraNbr = -1;
    this.nbrOfMods = -1;
    this.turnLimitNbr = -1;
    this.nationStatusArray = [];

    this.getlastUpdateTimestamp = () => this.lastUpdateTimestamp;

    this.update = async () =>
    {
        if (fs.existsSync(_originalPath) === false)
            return;

        // Gather the statusdump file last modified time
        const stat = await fsp.stat(_originalPath);
        const statusdumpMTime = stat.mtime.getTime();

        // If it hasn't changed, no need to update it
        if (this.lastUpdateTimestamp >= statusdumpMTime)
            return;

        // Otherwise get the most recent statusdump metadata and update this wrapper
        const rawData = await fsp.readFile(_originalPath, "utf8");
        const _parsedData = _parseDumpData(rawData);

        this.lastUpdateTimestamp = statusdumpMTime;

        if (assert.isInteger(_parsedData.turnNbr) === true)
        {
            this.turnNbr = _parsedData.turnNbr;

            if (this.turnNbr > 0)
                this.hasStarted = true;

            // Games in lobby will show turn -1
            else if (this.turnNbr === -1)
                this.hasStarted = false;
        }

        if (assert.isInteger(_parsedData.eraNbr) === true)
            this.eraNbr = _parsedData.eraNbr;

        if (assert.isInteger(_parsedData.nbrOfMods) === true)
            this.nbrOfMods = _parsedData.nbrOfMods;

        if (assert.isInteger(_parsedData.turnLimitNbr) === true)
            this.turnLimitNbr = _parsedData.turnLimitNbr;

        if (assert.isArray(_parsedData.nationsRawData) === true)
        {
            this.nationStatusArray = [];

            _parsedData.nationsRawData.forEach((nationData) => 
            {
                //avoid bad types and empty strings from splitting
                if (assert.isString(nationData) === true && /\S+/.test(nationData) === true)
                    this.nationStatusArray.push(new NationStatusWrapper(nationData));
            });
        }

        return this;
    };

    this.getSubmittedPretenders = () =>
    {
        const submittedNationStatuses = [];
        const savedgamesDir = path.resolve(configStore.dom5DataPath, `savedgames/${_gameName}`);

        this.nationStatusArray.forEach((nationStatus) =>
        {
            if (fs.existsSync(path.resolve(savedgamesDir, `${nationStatus.filename}.2h`)) === true)
                submittedNationStatuses.push(nationStatus);
        });

        return submittedNationStatuses;
    };

    this.hasSelectedNations = () =>
    {
        return this.nationStatusArray.filter((nationStatus) => nationStatus.isHuman || nationStatus.isAi).length > 0;
    };

    this.getNationsWithUndoneTurns = () => 
    {
        if (assert.isArray(this.nationStatusArray) === false || this.nationStatusArray.length <= 0)
            return null;

        const undoneTurns = this.nationStatusArray.filter((nationStatus) => 
        {
            return nationStatus.isTurnFinished === false && nationStatus.isHuman === true;
        });

        return undoneTurns;
    };

    this.fetchStales = () =>
    {
        const undoneTurns = this.getNationsWithUndoneTurns();
        const staleObj = { 
            stales: [], 
            wentAi: [] 
        };

        if (assert.isArray(undoneTurns) === false)
            return Promise.reject(`Stale data unavailable.`);

        if (undoneTurns.length <= 0)
            return Promise.resolve(staleObj);

        undoneTurns.forEach((nationStatus) => staleObj.stales.push(nationStatus.fullName));

        // Clear this statusdump's file, since it won't be needed again
        fsp.unlink(_originalPath)
        .then(() => fsp.rmdir(_originalPath.replace(`/${STATUSDUMP_FILENAME}`, "")));

        return Promise.resolve(staleObj);
    };
}

function _parseDumpData(rawData)
{
    const data = {};
    var lines;
    var turnInfoLine;

    if (assert.isString(rawData) === false)
        return data;

    //Remove first line: "Status for '3man_Warhammer'"
    lines = rawData.split("\n").slice(1);
    turnInfoLine = lines[0];

    data.nationsRawData = lines.slice(1);
    data.turnNbr = +turnInfoLine.replace(/^turn (-?\d+).*$/ig, "$1");
    data.eraNbr = +turnInfoLine.replace(/^.+era (\d+).*$/ig, "$1");
    data.nbrOfMods = +turnInfoLine.replace(/^.+mods (\d+).*$/ig, "$1");
    data.turnLimitNbr = +turnInfoLine.replace(/^.+turnlimit (\d+).*$/ig, "$1");

    return data;
}