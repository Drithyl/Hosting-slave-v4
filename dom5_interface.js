
const fs = require("fs");
const fsp = require("fs").promises;
const config = require("./config.json");
const rw = require("./reader_writer.js");
const kill = require("./kill_instance.js");
const spawn = require("./process_spawn.js").spawn;
const readFileBuffer = require("./read_file_buffer.js");
const provCountFn = require("./dom5/parse_province_count.js");
const { fetchStatusDump } = require("./dom5/status_dump_wrapper.js");

module.exports.getModList = function(cb)
{
  rw.getDirFilenames(`${config.dom5DataPath}/mods`, ".dm")
  .then((filenames) => cb(null, filenames))
  .catch((err) => cb(err.message));
};

module.exports.getMapList = function(cb)
{
  let mapsWithProvinceCount = [];

  rw.getDirFilenames(config.dom5DataPath + "/maps", ".map")
  .then((filenames) =>
  {
    filenames.forEach((file) =>
    {
      let provs = provCountFn(file.content);

      if (provs != null)
      {
        mapsWithProvinceCount.push({name: file.filename, ...provs});
      }
    });

    cb(null, mapsWithProvinceCount);
  })
  .catch((err) => cb(err.message));
};

module.exports.getTurnFile = function(data, cb)
{
    var gameName = data.name;
    var nationFilename = data.nationFilename;
    var path = `${config.dom5DataPath}/savedgames/${gameName}/${nationFilename}`;

    readFileBuffer(path)
    .then((buffer) => cb(null, buffer))
    .catch((err) => cb(err.message));
};

module.exports.getScoreFile = function(data, cb)
{
    var gameName = data.name;
    var path = `${config.dom5DataPath}/savedgames/${gameName}/scores.html`;

    readFileBuffer(path)
    .then((buffer) => cb(null, buffer))
    .catch((err) => cb(err.message));
};

module.exports.start = function(data, cb)
{
  var path = `${config.dom5DataPath}/savedgames/${games[data.port].name}/domcmd`;

  fsp.writeFile(path, "settimeleft " + data.timer)
  .then(() => cb())
  .catch((err) => cb(err.message));
}

module.exports.restart = function(data, cb)
{
  var game = games[data.port];
  var path = `${config.dom5DataPath}/savedgames/${game.name}`;

  rw.log("general", `Killing ${game.name}'s process...`);

  //kill game first so it doesn't automatically regenerate the statuspage file
  //as soon as it gets deleted
  kill(game)
  .then(() => rw.atomicRmDir(path))
  .then(() => spawn(game.port, game.args, game))
  .then(() => cb())
  .catch((err) => cb(err.message));
};

module.exports.getSubmittedPretenders = function(data, cb)
{
  return fetchStatusDump(data.name)
  .then((statusDumpWrapper) => cb(null, statusDumpWrapper.getSubmittedPretenders()));
};

module.exports.removePretender = function(data, cb)
{
  var game = games[data.port];
  var path = config.dom5DataPath + "/savedgames/" + game.name + "/" + data.nationFile;

	if (fs.existsSync(path) === false)
	  return cb("Could not find the pretender file. Has it already been deleted? You can double-check in the lobby. If not, you can try rebooting the game.");

  fsp.unlink(path)
  .then(() => cb())
  .catch((err) => cb(err.message));
};

module.exports.getStales = function(data, cb)
{
  return fetchStatusDump(data.name)
  .then((statusDumpWrapper) => statusDumpWrapper.fetchStales())
  .then((stales) => cb(null, stales));
};

module.exports.getDump = function(data, cb)
{
  return fetchStatusDump(data.name)
  .then((statusDumpWrapper) => cb(null, statusDumpWrapper));
};

module.exports.backupSavefiles = function(data, cb)
{
  var game = games[data.port];
  var source = `${config.dom5DataPath}/savedgames/${game.name}`;
  var target = `${config.dataFolderPath}/backups`;

  if (data.isNewTurn === true)
  {
    target += `${config.newTurnsBackupDirName}/${game.name}/Turn ${data.turnNbr}`;
  }

  else target += `${config.latestTurnBackupDirName}/${game.name}/Turn ${data.turnNbr}`;

  rw.copyDir(source, target, false, ["", ".2h", ".trn"], cb);
};

module.exports.rollback = function(data, cb)
{
  var game = games[data.port];
  var source = `${config.dataFolderPath}/backups/${config.latestTurnBackupDirName}/${game.name}/Turn ${data.turnNbr}`;
  var target = `${config.dom5DataPath}/savedgames/${game.name}`;

  if (fs.existsSync(source) === false)
  {
    source = `${config.dataFolderPath}/backups/${config.newTurnsBackupDirName}/${game.name}/Turn ${data.turnNbr}`;

    if (fs.existsSync(source) === false)
      return cb(`No backup of the previous turn was found to be able to rollback.`);
  }

  rw.copyDir(source, target, false, ["", ".2h", ".trn"])
  .then(() => kill(game))
  .then(() => spawn(game))
  .then(() => cb())
  .catch((err) => cb(err.message));
};

module.exports.deleteGameSavefiles = function(data, cb)
{
  var game = games[data.port];
  var path = `${config.dom5DataPath}/savedgames/${game.name}`;

  fsp.readdir(path)
  .then((filenames) =>
  {
    filenames.forEach(function(file)
    {
      fs.unlinkSync(path + "/" + file);
    });

    fs.rmdirSync(path);
    cb(null, `${game.name}: deleted the dom save files.`);
  })
  .catch((err) => cb(err.message));
};

module.exports.getLastHostedTime = function(data, cb)
{
  return fetchStatusDump(data.name)
  .then((statusDumpWrapper) => cb(null, statusDumpWrapper.lastHostedTime));
};

module.exports.validateMapfile = function(mapfile, cb)
{
  var dataPath = config.dom5DataPath;
  var rootPath = config.dom5RootPath;
  var mapfileRelPath = (/\.map$/i.test(mapfile) === false) ? `/maps/${mapfile}.map` : `/maps/${mapfile}`;

  if (typeof mapfile !== "string")
    return cb(`Invalid argument type provided; expected string path, got ${mapfile}`);

  if (fs.existsSync(`${dataPath}${mapfileRelPath}`) === true || fs.existsSync(`${rootPath}${mapfileRelPath}`) === true)
    return cb();

  else cb("The map file could not be found.");
};

module.exports.validateMods = function(modfiles, cb)
{
  var path = config.dom5DataPath;

  if (Array.isArray(modfiles) === false)
    return cb(`Invalid argument type provided; expected array of string paths, got ${modfiles}`);

  for (var i = 0; i < modfiles.length; i++)
  {
    var modfile = modfiles[i];

    if (typeof modfile !== "string")
      return cb(`Invalid modfiles element; expected path string, got ${modfile}`);

    if (fs.existsSync(`${path}/mods/${modfile}`) === false)
      return cb(`The mod file ${modfile} could not be found.`);
  }

  cb();
};