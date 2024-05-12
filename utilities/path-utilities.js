require('dotenv').config();
const path = require("path");
const InvalidPathError = require('../errors/InvalidPathError');
const { DOM6_GAME_TYPE_NAME, DOM5_GAME_TYPE_NAME, CLONED_STATUSDUMP_DIR_NAME } = require("../constants");
const { BACKUPS_DIR_PATH, POST_EXEC_BACKUP_DIR_NAME, PRE_EXEC_BACKUP_DIR_NAME, GAME_LOGS_DIR_PATH } = require('../constants');


module.exports.safePath = function(rootPath, ...paths) {
    const normRoot = path.resolve(rootPath);
    const fullPath = path.resolve(rootPath, ...paths);
  
    if (fullPath.indexOf(normRoot) === 0)
        return fullPath;
  
    throw new InvalidPathError(`Path would result in directory traversal: ${fullPath} (root: ${normRoot})`);
};

module.exports.getDominionsDataPath = function(gameType) {
    if (gameType === DOM6_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM6_DATA_PATH);
    else if (gameType === DOM5_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM5_DATA_PATH);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getDominionsRootPath = function(gameType) {
    if (gameType === DOM6_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM6_ROOT_PATH);
    else if (gameType === DOM5_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM5_ROOT_PATH);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getDominionsExePath = function(gameType) {
    if (gameType === DOM6_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM6_EXE_PATH);
    else if (gameType === DOM5_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM5_EXE_PATH);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getDominionsTmpPath = function(gameType) {
    if (gameType === DOM6_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM6_TEMP_PATH);
    else if (gameType === DOM5_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM5_TEMP_PATH);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getDominionsSavedgamesPath = function(gameType) {
    return path.resolve(module.exports.getDominionsDataPath(gameType), 'savedgames');
};

module.exports.getDominionsModsPath = function(gameType) {
    return path.resolve(module.exports.getDominionsDataPath(gameType), 'mods');
};

module.exports.getDominionsMapsPath = function(gameType) {
    return path.resolve(module.exports.getDominionsDataPath(gameType), 'maps');
};

module.exports.getDominionsMapExtension = function(gameType) {
    if (gameType === DOM6_GAME_TYPE_NAME)
        return ".map";
    else if (gameType === DOM5_GAME_TYPE_NAME)
        return ".map";
};

module.exports.appendDominionsMapExtension = function(filename, gameType) {
    const mapExtension = module.exports.getDominionsMapExtension(gameType);
    const hasExtension = filename.lastIndexOf(mapExtension) !== -1;

    if (hasExtension === true)
        return filename;

    return filename + mapExtension;
};


module.exports.getGameBackupPath = function(gameName) {
    return path.resolve(BACKUPS_DIR_PATH, gameName);
};

module.exports.getGamePreTurnBackupPath = function(gameName) {
    return path.resolve(this.getGameBackupPath(gameName), PRE_EXEC_BACKUP_DIR_NAME);
};

module.exports.getGamePostTurnBackupPath = function(gameName) {
    return path.resolve(this.getGameBackupPath(gameName), POST_EXEC_BACKUP_DIR_NAME);
};


module.exports.getGameLogPath = function(gameName) {
    return path.resolve(GAME_LOGS_DIR_PATH, gameName);
};


module.exports.getStatusdumpClonePath = function(gameName, gameType) {
    return path.resolve(this.getDominionsDataPath(gameType), CLONED_STATUSDUMP_DIR_NAME, gameName);
};
