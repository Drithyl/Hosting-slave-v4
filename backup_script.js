
const fs = require("fs");
const fsp = require("fs").promises;
const config = require("./config.json");
const rw = require("./reader_writer.js");
const socketWrapper = require("./socket_wrapper.js");
const preexecRegex = new RegExp("^\\-\\-preexec$", "i");
const postexecRegex = new RegExp("^\\-\\-postexec$", "i");
const statusDump = require("./dom5/status_dump_wrapper.js");
const extensionsToBackupRegex = new RegExp("(\.2h)|(\.trn)|(ftherlnd)$", "i");


var fetchedStatusDump;
var gameName = process.argv[2];
var type = process.argv[3];
var source = `${config.dom5DataPath}/savedgames/${gameName}`;
var target = `${config.dataFolderPath}/backups`;


rw.log(["backup"], `Backup type ${type} for ${gameName} starting.`);


if (gameName == null)
    return rw.log(["error", "backup"], true, `No game name argument received.`);

if (preexecRegex.test(type) === true)
    target += `${config.latestTurnBackupDirName}/${gameName}`;

else if (postexecRegex.test(type) === true)
{
    console.log(`${gameName}: new turn!`);
    target += `${config.newTurnsBackupDirName}/${gameName}`;
    socketWrapper.emit("NEW_TURN", { gameName: gameName });
}

else
    return rw.log(["error", "backup"], true, `Backup type received is invalid; expected --preexec or --postexec: ${type}`);


statusDump.fetchStatusDump(gameName)
.then((statusDumpWrapper) =>
{
    //statusdump doesn't update fast enough right after turn processes,
    //so turn number will have to be manually increased
    statusDumpWrapper.turnNbr++;
    fetchedStatusDump = statusDumpWrapper;
    return _createDirectories(`${target}/Turn ${turnInfo.turn}`);
})
.then(() => fsp.readdir(source))
.then((filenames) =>
{
    filenames.forEachPromise((filename, index, nextPromise) =>
    {
        return Promise.resolve()
        .then(() =>
        {
            if (extensionsToBackupRegex.test(filename) === true)
            {
                return fsp.readFile(`${source}/${filename}`)
                .then((buffer) => fsp.writeFile(`${target}/Turn ${turnInfo.turn}/${filename}`, buffer));
            }

            else return Promise.resolve();
        })
        .then(() => nextPromise());
    })
    .then(() =>
    {
        //delete previous backups according to the configuration
        if (turnInfo.turn > config.nbrOfTurnsBackedUp)
        {
            if (fs.existsSync(`${target}/Turn ${turnInfo.turn - config.nbrOfTurnsBackedUp}`) === false)
            return Promise.resolve();

            return rw.atomicRmDir(`${target}/Turn ${turnInfo.turn - config.nbrOfTurnsBackedUp}`);
        }

        else return Promise.resolve();
    });
});


function _createDirectories(target)
{
    //Linux base paths begin with / so ignore the first empty element
    if (target.indexOf("/") === 0)
        target = target.slice(1);

    var directories = target.split("/");
    var currentPath = directories.shift();

    if (process.platform === "linux")
        currentPath = `/${currentPath}`;

    if (fs.existsSync(currentPath) === false)
        throw new Error(`The base path ${currentPath} specified for the backup target does not exist.`);

    return directories.forEachPromise((dir, index, nextPromise) =>
    {
        currentPath += `/${dir}`;

        if (fs.existsSync(currentPath) === false)
        {
            return fsp.mkdir(currentPath)
            .then(() => nextPromise());
        }
            
        else return nextPromise();
    });
}
