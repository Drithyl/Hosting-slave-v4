
const fs = require("fs");
const path = require("path");
const TypeError = require("../errors/TypeError.js");
const LengthError = require("../errors/LengthError.js");
const SemanticError = require("../errors/SemanticError.js");
const InstanceOfError = require("../errors/InstanceOfError.js");
const InvalidPathError = require("../errors/InvalidPathError.js");
const InvalidDiscordIdError = require("../errors/InvalidDiscordIdError.js");
const { DOM5_GAME_TYPE_NAME, DOM6_GAME_TYPE_NAME, DATA_DIR_PATH } = require("../constants.js");


module.exports.isArray = function(arr)
{
	return Array.isArray(arr);
};

module.exports.isObject = function(obj)
{
	return Array.isArray(obj) === false && typeof obj === "object" && obj != null;
};

module.exports.isSerializedBuffer = function(obj)
{
    return this.isObject(obj) === true && obj.type === "Buffer" && isArray(obj.data) === true;
};

module.exports.isString = function(str)
{
	return typeof str === "string";
};

module.exports.isBoolean = function(bool)
{
	return typeof bool === "boolean";
};

module.exports.isFunction = function(fn)
{
	return typeof fn === "function";
};

module.exports.isRegexp = function(regexp)
{
	return RegExp.prototype.isPrototypeOf(regexp) === true;
};

module.exports.isParsedByRegexp = function(str, regexp)
{
	return regexp.test(str) === true;
};

module.exports.isLessThanNCharacters = function(str, n)
{
	return str.length < n;
};

module.exports.isMoreThanNCharacters = function(str, n)
{
	return str.length > n;
};

module.exports.isNumber = function(nbr)
{
	return isNaN(nbr) === false;
};

module.exports.isInteger = function(nbr)
{
	return Number.isInteger(nbr);
};

module.exports.isNumberInRange = function(nbr, min, max)
{
	return nbr > min && nbr < max;
};

module.exports.isStringInArray = function(str, array)
{
	return array.includes(str) === true;
};

module.exports.isInstanceOfPrototype = function(instance, prototypeDef)
{
	return prototypeDef.prototype.isPrototypeOf(instance);
};

module.exports.isPermissionsError = function(error)
{
	return this.isInstanceOfPrototype(error, PermissionsError);
};

module.exports.isSemanticError = function(error)
{
	return this.isInstanceOfPrototype(error, SemanticError);
};

module.exports.doesStringEndIn = function(str, ending)
{
	return this.isArray(str.match(`^.*${ending}$`));
};

module.exports.isValidPath = function(path)
{
	return fs.existsSync(path);
};

module.exports.isValidDiscordId = function(id)
{
	return this.isString(id) === true && /^\d{18}$/.test(id) === true;
};

module.exports.isValidGameType = function(gameType)
{
    if (gameType.toLowerCase() === DOM5_GAME_TYPE_NAME.toLowerCase() ||
        gameType.toLowerCase() === DOM6_GAME_TYPE_NAME.toLowerCase())
    {
        return true;
    }

    else return false;
};


module.exports.isArrayOrThrow = function(arr)
{
    if (this.isArray(arr) === false)
        throw new TypeError(`Expected Array, got: <${arr}>`);
};

module.exports.isObjectOrThrow = function(obj)
{
    if (this.isObject(obj) === false)
        throw new TypeError(`Expected Object, got: <${obj}>`);
};

module.exports.isSerializedBufferOrThrow = function(obj)
{
    if (this.isSerializedBuffer(obj) === false)
        throw new TypeError(`Expected Serialized Buffer, got: <${obj}> (${typeof obj})`);
};

module.exports.isStringOrThrow = function(str)
{
    if (this.isString(str) === false)
        throw new TypeError(`Expected String, got: <${str}>`);
};

module.exports.isNumberOrThrow = function(nbr)
{
    if (this.isNumber(nbr) === false)
        throw new TypeError(`Expected Number, got: <${nbr}>`);
};

module.exports.isIntegerOrThrow = function(nbr)
{
    if (this.isInteger(nbr) === false)
        throw new TypeError(`Expected Integer, got: <${nbr}>`);
};

module.exports.isBooleanOrThrow = function(bool)
{
    if (this.isBoolean(bool) === false)
        throw new TypeError(`Expected Boolean, got: <${bool}>`);
};

module.exports.isFunctionOrThrow = function(fn)
{
    if (this.isFunction(fn) === false)
        throw new TypeError(`Expected Function, got: <${fn}>`);
};

module.exports.isRegexpOrThrow = function(regexp)
{
    if (this.isRegexp(regexp) === false)
        throw new TypeError(`Expected RegExp, got: <${regexp}>`);
};

module.exports.isParsedByRegexpOrThrow = function(str, regexp)
{
    this.isRegexpOrThrow(regexp);

    if (this.isParsedByRegexp(str, regexp) === false)
        throw new SemanticError(`String could not be parsed by regexp: ${str}`);
};

module.exports.isLessThanNCharactersOrThrow = function(str, n)
{
    if (this.isLessThanNCharacters(str, n) === false)
        throw new LengthError(`Expected String to be less than ${n} characters, got: <${str.length}>`);
};

module.exports.isMoreThanNCharactersOrThrow = function(str, n)
{
    if (this.isMoreThanNCharacters(str, n) === false)
        throw new LengthError(`Expected String to be more than ${n} characters, got: <${str.length}>`);
};

module.exports.isNumberInRangeOrThrow = function(nbr, min, max)
{
    this.isNumberOrThrow(nbr);
    this.isNumberOrThrow(min);
    this.isNumberOrThrow(max);

    if (this.isNumberInRange(nbr, min, max) === false)
        throw new SemanticError(`Expected Number > ${min} and < ${max}, got: <${nbr}>`);
};

module.exports.isStringInArrayOrThrow = function(str, array)
{
    if (this.isStringInArray(str, array) === false)
        throw new SemanticError(`Got <${str}>, expected it to be one of: ${array}`);
};

module.exports.isInstanceOfPrototypeOrThrow = function(instance, prototypeDef)
{
    if (this.isInstanceOfPrototype(instance, prototypeDef) === false)
        throw new InstanceOfError(`Expected instance of ${prototypeDef.name}, got: <${instance}>`);
};

module.exports.isSemanticErrorOrThrow = function(error)
{
    if (this.isSemanticError(error) === false)
        throw new InstanceOfError(`Expected instance of ${SemanticError.name}, got: <${error}>`);
};

module.exports.doesStringEndInOrThrow = function(str, ending)
{
    this.isStringOrThrow(str);
    this.isStringOrThrow(ending);

    if (this.doesStringEndIn(str, ending) === false)
        throw new SemanticError(`Expected string to end in <${ending}>, got <${str}>`);
};

module.exports.isValidGameTypeOrThrow = function(gameType)
{
    if (this.isValidGameType(gameType) === false)
        throw new SemanticError(`Value of gameType does not match any configured value, got: <${gameType}>`);
};

module.exports.isValidPathOrThrow = function(path)
{
    if (this.isValidPath(path) === false)
        throw new InvalidPathError(`Path does not exist: ${path}`);
};

module.exports.isValidDiscordIdOrThrow = function(id)
{
    if (this.isValidDiscordId(id) === false)
        throw new InvalidDiscordIdError(`Id is not a valid Discord Id: ${id}`);
};

module.exports.isParsableNumber = function(value) {
    if (value === undefined || value === null) {
        return false;
    }

    if (value === "") {
        return false;
    }

    if (isNaN(Number(value)) === true) {
        return false;
    }

    return true;
};

module.exports.parseNumber = function(value) {
    if (module.exports.isParsableNumber(value) === false) {
        return NaN;
    }

    return Number(value);
};

module.exports.extendTypes = function() {
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
};
