require('dotenv').config();
const path = require("path");
const constants = require("../constants");
const InvalidPathError = require('../errors/InvalidPathError');


module.exports.safePath = function(rootPath, ...paths) {
    const normRoot = path.resolve(rootPath);
    const fullPath = path.resolve(rootPath, ...paths);
  
    if (fullPath.indexOf(normRoot) === 0)
        return fullPath;
  
    throw new InvalidPathError(`Path would result in directory traversal: ${fullPath} (root: ${normRoot})`);
};

module.exports.getDominionsDataPath = function(gameType) {
    if (gameType === constants.DOM6_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM6_DATA_PATH);
    else if (gameType === constants.DOM5_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM5_DATA_PATH);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getDominionsRootPath = function(gameType) {
    if (gameType === constants.DOM6_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM6_ROOT_PATH);
    else if (gameType === constants.DOM5_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM5_ROOT_PATH);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getDominionsExePath = function(gameType) {
    if (gameType === constants.DOM6_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM6_EXE_PATH);
    else if (gameType === constants.DOM5_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM5_EXE_PATH);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getDominionsTmpPath = function(gameType) {
    if (gameType === constants.DOM6_GAME_TYPE_NAME)
        return path.resolve(process.env.DOM6_TEMP_PATH);
    else if (gameType === constants.DOM5_GAME_TYPE_NAME)
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
    if (gameType === constants.DOM6_GAME_TYPE_NAME)
        return ".map";
    else if (gameType === constants.DOM5_GAME_TYPE_NAME)
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
    return path.resolve(constants.BACKUPS_DIR_PATH, gameName);
};

module.exports.getGamePreTurnBackupPath = function(gameName) {
    return path.resolve(module.exports.getGameBackupPath(gameName), constants.PRE_EXEC_BACKUP_DIR_NAME);
};

module.exports.getGamePostTurnBackupPath = function(gameName) {
    return path.resolve(module.exports.getGameBackupPath(gameName), constants.POST_EXEC_BACKUP_DIR_NAME);
};


module.exports.getGameLogPath = function(gameName) {
    return path.resolve(constants.GAME_LOGS_DIR_PATH, gameName);
};


module.exports.getStatusdumpClonePath = function(gameName, gameType) {
    return path.resolve(module.exports.getDominionsDataPath(gameType), constants.CLONED_STATUSDUMP_DIR_NAME, gameName);
};

// As per NodeJS' guidelines: 
// https://nodejs.org/en/knowledge/file-system/security/introduction/#preventing-directory-traversal
module.exports.isSafePathToDelete = function(filePath)
{
    const normDataRoot = path.resolve(constants.DATA_DIR_PATH);
    const normDom5DataRoot = path.resolve(process.env.DOM5_DATA_PATH);
    const normDom6DataRoot = path.resolve(process.env.DOM6_DATA_PATH);
    const fullPath = path.join(filePath);

    if (fullPath.indexOf(normDataRoot) === 0 ||
        fullPath.indexOf(normDom5DataRoot) === 0 ||
        fullPath.indexOf(normDom6DataRoot) === 0)
    {
        return true;
    }

    else return false;
};

module.exports.isSafePathToDeleteOrThrow = function(filePath)
{
    if (module.exports.isSafePathToDelete(filePath) === false)
        throw new InvalidPathError(`Invalid path to delete as it's not a data folder or would result in directory traversal: ${filePath}`);
};
