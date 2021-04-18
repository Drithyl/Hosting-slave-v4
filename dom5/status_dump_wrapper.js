
const fs = require("fs");
const fsp = require("fs").promises;
const log = require("../logger.js");
const configStore = require("../config_store.js");
const NationStatusWrapper = require("./nation_status_wrapper.js");

exports.fetchStatusDump = (gameName) =>
{
    var rawData;
    const gameDataPath = `${configStore.dom5DataPath}/savedgames/${gameName}`;
    const statusDumpPath = `${gameDataPath}/statusdump.txt`;

    if (fs.existsSync(statusDumpPath) === false)
        return Promise.reject(new Error(`Could not find ${gameName}'s statusdump.`));

    return fsp.readFile(statusDumpPath, "utf8")
    .then((statusDumpRawData) =>
    {
        rawData = statusDumpRawData;
        
        return Promise.resolve(new StatusDump(gameName, rawData));
    })
    .catch((err) => Promise.reject(new Error(`Could not create statusdump object:\n\n${err.message}`)));
};

function StatusDump(gameName, rawData)
{
    const _gameName = gameName;
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
        const path = `${configStore.dom5DataPath}/savedgames/${_gameName}`;

        this.nationStatusArray.forEach((nationStatus) =>
        {
            if (fs.existsSync(`${path}/${nationStatus.filename}.2h`) === true)
                submittedNationStatuses.push(nationStatus);
        });

        return submittedNationStatuses;
    };

    this.fetchStales = () =>
    {
        const staleArrayByName = [];
        const goneAiArrayByName = [];
        const path = `${configStore.dom5DataPath}/savedgames/${_gameName}`;
        const ftherlndFilePath = `${path}/ftherlnd`;

        if (fs.existsSync(ftherlndFilePath) === false)
            return Promise.resolve({ stales: ["ftherlnd file does not exist??"], wentAi: goneAiArrayByName });

        return fsp.stat(ftherlndFilePath)
        .then((ftherlndFileStats) =>
        {
            const lastHostedTime = ftherlndFileStats.mtime.getTime();

            return this.nationStatusArray.forEachPromise((nationStatus, index, nextPromise) =>
            {
                const nationFilePath = `${path}/${nationStatus.filename}.2h`;

                if (nationStatus.wentAiThisTurn === true)
                {
                    goneAiArrayByName.push(nationStatus.fullName);
                    return nextPromise();
                }

                if (nationStatus.isHuman === true)
                {
                    // When a nation's .2h file does not exist, no orders were given
                    if (fs.existsSync(nationFilePath) === false)
                    {
                        staleArrayByName.push(nationStatus.fullName);
                        return nextPromise();
                    }

                    return fsp.stat(nationFilePath)
                    .then((nationFileStats) =>
                    {
                        if (nationFileStats.mtime.getTime() < lastHostedTime)
                            staleArrayByName.push(nationStatus.fullName);

                        return nextPromise();
                    })
                    .catch((err) =>
                    {
                        log.error(log.getLeanLevel(), `${_gameName}\tCould not verify ${nationStatus.fullName} stale`, err);
                        staleArrayByName.push(nationStatus.fullName + "\tCould not verify if a stale occurred");
                        return nextPromise();
                    });
                }

                return nextPromise();
            })
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
    data.turnNbr = +turnInfoLine.replace(/^turn (-?\d+).*$/ig, "$1");
    data.eraNbr = +turnInfoLine.replace(/^.+era (\d+).*$/ig, "$1");
    data.nbrOfMods = +turnInfoLine.replace(/^.+mods (\d+).*$/ig, "$1");
    data.turnLimitNbr = +turnInfoLine.replace(/^.+turnlimit (\d+).*$/ig, "$1");

    return data;
}