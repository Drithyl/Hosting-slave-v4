const path = require("path");
const configStore = require('./config_store');

module.exports.getDominionsDataPath = function(gameType) {
    if (gameType === configStore.dom6GameTypeName)
        return path.resolve(configStore.dom6DataPath);
    else if (gameType === configStore.dom5GameTypeName)
        return path.resolve(configStore.dom5DataPath);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getDominionsRootPath = function(gameType) {
    if (gameType === configStore.dom6GameTypeName)
        return path.resolve(configStore.dom6RootPath);
    else if (gameType === configStore.dom5GameTypeName)
        return path.resolve(configStore.dom5RootPath);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getDominionsExePath = function(gameType) {
    if (gameType === configStore.dom6GameTypeName)
        return path.resolve(configStore.dom6ExePath);
    else if (gameType === configStore.dom5GameTypeName)
        return path.resolve(configStore.dom5ExePath);
    else {
        throw new Error(`Expected valid gameType; got <${gameType}>`);
    }
};

module.exports.getSlaveTmpPath = function() {
    return path.resolve(configStore.dataFolderPath, configStore.tmpFilesDirName);
};

module.exports.getDominionsTmpPath = function(gameType) {
    return path.resolve(module.exports.getDominionsDataPath(gameType), configStore.tmpFilesDirName);
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
    if (gameType === configStore.dom6GameTypeName)
        return ".map";
    else if (gameType === configStore.dom5GameTypeName)
        return ".map";
};

module.exports.appendDominionsMapExtension = function(filename, gameType) {
    const mapExtension = module.exports.getDominionsMapExtension(gameType);
    const hasExtension = filename.lastIndexOf(mapExtension) !== -1;

    if (hasExtension === true)
        return filename;

    return filename + mapExtension;
};


module.exports.init = function() {
    Array.prototype.forEachPromise = function(asyncFn, callback)
    {
        var index = 0;

        //the context of 'this' will change in the loop
        var array = this;

        return new Promise((resolve, reject) =>
        {
            (function loop()
            {
                if (index >= array.length)
                {
                    if (typeof callback === "function")
                        return callback();

                    else return resolve();
                }

                Promise.resolve(asyncFn(array[index], index++, () => loop()))
                .catch((err) => 
                {
                    index++;
                    reject(err);
                });
            })();
        });
    };

    Array.prototype.forAllPromises = function(asyncFn, breakOnError = true)
    {
        var self = this;
        var results = [];
        var left = self.length;

        if (left <= 0)
            return Promise.resolve([]);

        return new Promise((resolve, reject) =>
        {
            var errorOccurred = false;

            for (var i = 0; i < left; i++)
            {
                var item = self[i];

                Promise.resolve(asyncFn(item, i, self))
                .then((result) =>
                {
                    if (breakOnError === false || errorOccurred === false)
                    {
                        left--;
                        results.push(result);

                        if (left <= 0)
                            resolve(results);
                    }
                })
                .catch((err) =>
                {
                    if (breakOnError === true)
                    {
                        errorOccurred = true;
                        reject(err, results);
                    }

                    else
                    {
                        left--;
                        results.push(err);

                        if (left <= 0)
                            resolve(results);
                    }
                });
            }
        });
    };

    Object.defineProperty(Object.prototype, "forEachItem",
    {
        value: function(asyncFn)
        {
            var self = this;
            var keyArray = Object.keys(self);

            //Pass the item, the key to the item, and the object
            keyArray.forEach((key, index) => asyncFn(self[key], keyArray[index], self));
        },
        configurable: true
    });

    Object.defineProperty(Object.prototype, "forEachPromise",
    {
        value: function(asyncFn)
        {
            var index = 0;
            var self = this;
            var keyArray = Object.keys(self);

            return new Promise((resolve, reject) =>
            {
                (function loop()
                {
                    if (index >= keyArray.length)
                        return resolve();

                    //Pass the item, the key to the item, and the function to move to the next promise
                    Promise.resolve(asyncFn(self[keyArray[index]], keyArray[index++], () => loop()))
                    .catch((err) => 
                    {
                        index++;
                        reject(err);
                    });
                })();
            });
        },
        configurable: true
    });

    Object.defineProperty(Object.prototype, "forAllPromises",
    {
        value: function(asyncFn, breakOnError = true)
        {
            var self = this;
            var results = [];
            var keyArray = Object.keys(self);
            var left = keyArray.length;

            if (left <= 0)
                return Promise.resolve([]);

            return new Promise((resolve, reject) =>
            {
                for (var i = 0; i < left; i++)
                {
                    var key = keyArray[i];
                    var item = self[key];

                    Promise.resolve(asyncFn(item, key, self))
                    .then((result) =>
                    {
                        if (breakOnError === false || errorOccurred === false)
                        {
                            left--;
                            results.push(result);

                            if (left <= 0)
                                resolve(results);
                        }
                    })
                    .catch((err) =>
                    {
                        if (breakOnError === true)
                        {
                            errorOccurred = true;
                            reject(err, results);
                        }

                        else
                        {
                            left--;
                            results.push(err);

                            if (left <= 0)
                                resolve(results);
                        }
                    });
                }
            });
        },
        configurable: true
    });

    String.prototype.extract = function(regex)
    {
        const match = this.match(regex)[0];
        const splitArr = this.split(regex);
        const extractedStr = splitArr[splitArr.indexOf(match)];

        if (match == null)
            return "";

        return extractedStr;
    };

}