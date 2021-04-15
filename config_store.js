

const configHelper = require("./config_helper.js");

module.exports.createConfig = () =>
{
    // Set up config by asking user in console
    if (configHelper.hasConfig() === false)
        return configHelper.askConfigQuestions();

    else return Promise.resolve();
};

module.exports.loadConfig = () =>
{
    const config = configHelper.buildDataPath();

    for (var key in config)
        module.exports[key] = config[key];

    return module.exports;
};

