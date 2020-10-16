require("./prototype_functions.js");
const fs = require("fs");
const config = require("./config.json");
const rw = require("./reader_writer.js");
const timerParser = require("./timer_parser.js");
const preexecRegex = new RegExp("^\\-\\-preexec$", "i");
const postexecRegex = new RegExp("^\\-\\-postexec$", "i");
const extensionsToBackupRegex = new RegExp("(\.2h)|(\.trn)|(ftherlnd)$", "i");

var gameName = process.argv[2];
var type = process.argv[3];
var source = `${config.dom5DataPath}/savedgames/${gameName}`;
var target = `${config.dataFolderPath}/backups`;
var turn;
var turnInfo;

rw.log(["backup"], `Backup type ${type} for ${gameName} starting.`);

if (gameName == null)
{
  rw.log(["error", "backup"], true, `No game name argument received.`);
}

if (preexecRegex.test(type) === true)
{
  target += `${config.latestTurnBackupDirName}/${gameName}`;
}

else if (postexecRegex.test(type) === true)
{
  target += `${config.newTurnsBackupDirName}/${gameName}`;
}

else
{
  rw.log(["error", "backup"], true, `Backup type received is invalid; expected --preexec or --postexec: ${type}`);
  return;
}

try
{
  turnInfo = timerParser.getTurnInfoSync(gameName);
}

catch(err)
{
  rw.log(["error", "backup"], true, `Statuspage reading Error:\n\n${err.message}`);
  return;
}

if (turnInfo == null)
{
  rw.log(["error", "backup"], true, `Statuspage could not be found, cannot archive turn.`);
  return;
}

//statuspages don't update fast enough to give the new turn number right after
//the turn processes, therefore add 1 to it
if (postexecRegex.test(type) === true)
{
  turnInfo.turn++;
}

try
{
  createDirsSync(`${target}/Turn ${turnInfo.turn}`);
}

catch(err)
{
  rw.log(["error", "backup"], true, `Dirs could not be created for backups:\n\n${err.message}`);
  return;
}

try
{
  let filenames = fs.readdirSync(source);

  filenames.forEach((filename) =>
  {
    if (extensionsToBackupRegex.test(filename) === true)
    {
      let data = fs.readFileSync(`${source}/${filename}`);
      fs.writeFileSync(`${target}/Turn ${turnInfo.turn}/${filename}`, data);
    }
  });

  //delete previous backups according to the configuration
  if (turnInfo.turn > config.nbrOfTurnsBackedUp)
  {
    if (fs.existsSync(`${target}/Turn ${turnInfo.turn - config.nbrOfTurnsBackedUp}`) === true)
    {
      rw.atomicRmDir(`${target}/Turn ${turnInfo.turn - config.nbrOfTurnsBackedUp}`, function(err)
      {
        if (err)
        {
          rw.log(["error", "backup"], `atomicRmDir() Error: ${err.message}`);
        }
      });
    }
  }
}

catch(err)
{
  rw.log(["error", "backup"], `FS Error: ${err.message}`);
}

function createDirsSync(target)
{
  //Linux base paths begin with / so ignore the first empty element
  if (target.indexOf("/") === 0)
  {
    target = target.slice(1);
  }

  let dirs = target.split("/");
  let currentPath = dirs.shift();

  if (process.platform === "linux")
  {
    currentPath = `/${currentPath}`;
  }

  if (fs.existsSync(currentPath) === false)
  {
    throw new Error(`The base path ${currentPath} specified for the backup target does not exist.`);
  }

  dirs.forEach((dir) =>
  {
    currentPath += `/${dir}`;

    if (fs.existsSync(currentPath) === false)
    {
      fs.mkdirSync(currentPath);
    }
  });
}
