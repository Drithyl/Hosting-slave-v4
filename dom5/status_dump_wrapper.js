
const fs = require("fs");
const path = require("path");
const fsp = require("fs").promises;
const assert = require("../asserter.js");
const rw = require("../reader_writer.js");
const configStore = require("../config_store.js");
const NationStatusWrapper = require("./nation_status_wrapper.js");

const STATUSDUMP_FILENAME = "statusdump.txt";


exports.fetchStatusDump = (gameName, filePath = null) =>
{
    var rawData;
    const gameDataPath = path.resolve(configStore.dom5DataPath, `savedgames/${gameName}`);
    const statusDumpPath = (assert.isString(filePath) === false) ? path.resolve(gameDataPath, STATUSDUMP_FILENAME) : path.resolve(filePath, STATUSDUMP_FILENAME);

    if (fs.existsSync(statusDumpPath) === false)
        return Promise.reject(new Error(`Could not find ${gameName}'s statusdump at path ${statusDumpPath}`));

    return fsp.readFile(statusDumpPath, "utf8")
    .then((statusDumpRawData) =>
    {
        rawData = statusDumpRawData;
        
        return Promise.resolve(new StatusDump(gameName, statusDumpPath, rawData));
    })
    .catch((err) => Promise.reject(new Error(`Could not create statusdump object:\n\n${err.message}`)));
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

function StatusDump(gameName, originalPath, rawData)
{
    const _gameName = gameName;
    const _originalPath = originalPath;
    const _parsedData = _parseDumpData(rawData);
    
    this.turnNbr = _parsedData.turnNbr;
    this.eraNbr = _parsedData.eraNbr;
    this.nbrOfMods = _parsedData.nbrOfMods;
    this.turnLimitNbr = _parsedData.turnLimitNbr;

    this.nationStatusArray = [];

    _parsedData.nationsRawData.forEach((nationRawData) =>
    {
        //avoid bad types and empty strings from splitting
        if (typeof nationRawData === "string" && /\S+/.test(nationRawData) === true)
            this.nationStatusArray.push(new NationStatusWrapper(nationRawData));
    });

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

    this.getNationsWithUndoneTurns = () => this.nationStatusArray.filter((nationStatus) => nationStatus.isTurnFinished === false && nationStatus.isHuman === true);

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
    //Remove first line: "Status for '3man_Warhammer'"
    const lines = rawData.split("\n").slice(1);
    const turnInfoLine = lines[0];
    
    const data = {};

    data.nationsRawData = lines.slice(1);
    data.turnNbr = +turnInfoLine.replace(/^turn (-?\d+).*$/ig, "$1");
    data.eraNbr = +turnInfoLine.replace(/^.+era (\d+).*$/ig, "$1");
    data.nbrOfMods = +turnInfoLine.replace(/^.+mods (\d+).*$/ig, "$1");
    data.turnLimitNbr = +turnInfoLine.replace(/^.+turnlimit (\d+).*$/ig, "$1");

    return data;
}