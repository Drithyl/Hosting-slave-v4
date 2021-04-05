
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const config = require("./config.json");
const exampleConfig = require("./example.config.json");

exports.buildDataPath = () =>
{
    if (config.dataFolderPath.startsWith(".") === true)
        config.dataFolderPath = path.resolve(__dirname, config.dataFolderPath);

    if (fs.existsSync(config.dataFolderPath) === false)
        fs.mkdirSync(config.dataFolderPath);

    return config;
};

exports.hasConfig = () => fs.existsSync("./config.json");

exports.askConfigQuestions = () =>
{
    var config = Object.assign({}, exampleConfig);

    return _promisifiedQuestion("Input master server's IP: ", (answer) =>
    {
        config.masterIP = answer;
    })
    .then(() => _promisifiedQuestion("Input server authentication id: ", (answer) =>
    {
        config.id = answer;
    }))
    .then(() => _promisifiedQuestion("Input number of game slots: ", (answer) =>
    {
        if (Number.isInteger(+answer) === false)
            return Promise.reject("Input is not an integer.");

        config.capacity = +answer;
    }))
    .then(() => _promisifiedQuestion("Input data folder dir (Enter for default): ", (answer) =>
    {        
        if (answer === "")
            return Promise.resolve();

        if (fs.existsSync(answer) === false)
            return Promise.reject("Path does not exist.");

        config.dataFolderPath = answer;
    }))
    .then(() => _promisifiedQuestion("Input Dom5 root path: ", (answer) =>
    {
        if (fs.existsSync(answer) === false)
            return Promise.reject("Path does not exist.");

        config.dom5RootPath = answer;
    }))
    .then(() => _promisifiedQuestion("Input Dom5 exe path: ", (answer) =>
    {
        if (fs.existsSync(answer) === false)
            return Promise.reject("Path does not exist.");

        config.dom5ExePath = answer;
    }))
    .then(() => _promisifiedQuestion("Input Dom5 data path: ", (answer) =>
    {
        if (fs.existsSync(answer) === false)
            return Promise.reject("Path does not exist.");

        config.dom5DataPath = answer;
    }))
    .then(() => fs.writeFileSync("./config.json", JSON.stringify(config, null, 2)));
};

function _promisifiedQuestion(question, onAnswerHandler)
{
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise((resolve) =>
    {
        (function _askQuestion()
        {
            rl.question(question, (answer) =>
            {
                Promise.resolve(onAnswerHandler(answer))
                .then(() => resolve())
                .catch((err) => 
                {
                    log.error(log.getLeanLevel(), `CONFIG HELPER QUESTION ERROR`, err);
                    _askQuestion();
                });
            });
        })();
    });
}