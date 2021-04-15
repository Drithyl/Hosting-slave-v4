
const fs = require("fs");
const path = require("path");
const readline = require("readline");
const exampleConfig = require("./example.config.json");

exports.buildDataPath = () =>
{
    const configData = require("./config.json");

    if (configData.dataFolderPath.startsWith(".") === true)
        configData.dataFolderPath = path.resolve(__dirname, configData.dataFolderPath);

    if (fs.existsSync(configData.dataFolderPath) === false)
        fs.mkdirSync(configData.dataFolderPath);

    return configData;
};

exports.hasConfig = () => fs.existsSync("./config.json");

exports.askConfigQuestions = () =>
{
    var newConfig = Object.assign({}, exampleConfig);

    return _promisifiedQuestion("Input master server's IP: ", (answer) =>
    {
        newConfig.masterIP = answer;
    })
    .then(() => _promisifiedQuestion("Input server authentication id: ", (answer) =>
    {
        newConfig.id = answer;
    }))
    .then(() => _promisifiedQuestion("Input number of game slots: ", (answer) =>
    {
        if (Number.isInteger(+answer) === false)
            return Promise.reject("Input is not an integer.");

        newConfig.capacity = +answer;
    }))
    .then(() => _promisifiedQuestion("Input data folder dir (Enter for default): ", (answer) =>
    {        
        if (answer === "")
            return Promise.resolve();

        if (fs.existsSync(answer) === false)
            return Promise.reject("Path does not exist.");

        newConfig.dataFolderPath = answer;
    }))
    .then(() => _promisifiedQuestion("Input Dom5 root path: ", (answer) =>
    {
        if (fs.existsSync(answer) === false)
            return Promise.reject("Path does not exist.");

        newConfig.dom5RootPath = answer;
    }))
    .then(() => _promisifiedQuestion("Input Dom5 exe path: ", (answer) =>
    {
        if (fs.existsSync(answer) === false)
            return Promise.reject("Path does not exist.");

        newConfig.dom5ExePath = answer;
    }))
    .then(() => _promisifiedQuestion("Input Dom5 data path: ", (answer) =>
    {
        if (fs.existsSync(answer) === false)
            return Promise.reject("Path does not exist.");

        newConfig.dom5DataPath = answer;
    }))
    .then(() => fs.writeFileSync("./config.json", JSON.stringify(newConfig, null, 2)));
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