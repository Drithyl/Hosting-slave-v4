
const fs = require("fs");
const fsp = require("fs").promises;
const config = require("../config.json");
const NationStatusWrapper = require("./nation_status_wrapper.js");

exports.fetchStatusDump = (gameName) =>
{
    var rawData;
    const gameDataPath = `${config.dom5DataPath}/savedgames/${gameName}`;

    if (fs.existsSync(path) === false)
        return Promise.reject(new Error(`Could not find ${gameName}'s statusdump.`));

    return fsp.readFile(`${gameDataPath}/statusdump.txt`, "utf8")
    .then((statusDumpRawData) =>
    {
        rawData = statusDumpRawData;
        return fsp.stat(`${gameDataPath}/ftherlnd`);
    })
    .then((statusDumpStat) =>
    {
        var lastHostedTime = statusDumpStat.mtime.getTime();
        return Promise.resolve(new StatusDump(gameName, rawData, lastHostedTime));
    })
    .catch((err) => Promise.reject(new Error(`Could not create statusdump object:\n\n${err.message}`)));
};

function StatusDump(gameName, rawData, lastHostedTime)
{
    const _gameName = gameName;
    const _parsedData = _parseDumpData(rawData);
    
    this.turnNbr = _parsedData.turnNbr;
    this.eraNbr = _parsedData.eraNbr;
    this.nbrOfMods = _parsedData.nbrOfMods;
    this.turnLimitNbr = _parsedData.turnLimitNbr;
    this.lastHostedTime = lastHostedTime;

    this.nationStatusArray = [];

    _parsedData.nationsRawData.forEach((nationRawData) =>
    {
        this.nationStatusArray.push(new NationStatusWrapper(nationRawData));
    });

    this.getSubmittedPretenders = () =>
    {
        const submittedNationStatuses = [];
        const path = `${config.dom5DataPath}/savedgames/${_gameName}`;

        this.nationStatusArray.forEach((nationStatus) =>
        {
            if (fs.existsSync(`${path}/${nationStatus.filename}`) === true)
                submittedNationNames.push(nationStatus);
        });

        return submittedNationStatuses;
    };

    this.fetchStales = () =>
    {
        const staleArrayByName = [];
        const goneAiArrayByName = [];
        const path = `${config.dom5DataPath}/savedgames/${_gameName}`;

        return this.nationStatusArray.forEachPromise((nationStatus, index, nextPromise) =>
        {
            const nationFilePath = `${path}/${nationStatus.filename}`;

            if (nationStatus.wentAiThisTurn === true)
            {
                goneAiArrayByName.push(nationStatus.fullName);
                return nextPromise();
            }

            if (nationStatus.isHuman === true && fs.existsSync(nationFilePath) === true)
            {
                return fsp.stat(nationFilePath)
                .then((nationFileStats) =>
                {
                    if (nationFileStats.mtime.getTime() >= this.lastHostedTime)
                        staleArrayByName.push(nationStatus.filename);

                    return nextPromise();
                });
            }

            return nextPromise();
        })
        .then(() => Promise.resolve({ stales: staleArrayByName, wentAi: goneAiArrayByName }));
    };
}

function _parseDumpData(rawData)
{
    //Remove first line: "Status for '3man_Warhammer'"
    const lines = rawData.split("\n").slice(1);
    const turnInfoLine = lines[0];
    
    const data = {};

    data.nationsRawData = lines.slice(1);
    data.turnNbr = +turnInfoLine.replace(/^turn (\d+).+$/ig, "$1");
    data.eraNbr = +turnInfoLine.replace(/^.+era (\d+).+$/ig, "$1");
    data.nbrOfMods = +turnInfoLine.replace(/^.+mods (\d+).+$/ig, "$1");
    data.turnLimitNbr = +turnInfoLine.replace(/^.+turnlimit (\d+).+$/ig, "$1");

    return data;
}