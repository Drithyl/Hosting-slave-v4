

const fs = require("fs");
const fsp = require("fs").promises;


//Discord only supports attachments of up to 8MB without Nitro
module.exports = function(filePath, maxSizeInMB = 8)
{  
    var fileSizeInMB;

    if (fs.existsSync(filePath) === false)
        return Promise.reject(`Path ${filePath} does not exist.`);

    return fsp.stat(filePath)
    .then((stats) =>
    {
        fileSizeInMB = stats.size / 1000000.0;

        if (fileSizeInMB > maxSizeInMB)
            return Promise.reject(`The turn file weighs ${fileSizeInMB}MB; max file size was set at ${maxSizeInMB}`);
        
        return fsp.readFile(filePath);
    })
    .then((buffer) =>
    {
        console.log(`Buffer for ${filePath} successfully read.`);
        return Promise.resolve(buffer);
    });
};