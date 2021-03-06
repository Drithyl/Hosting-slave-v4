

const fs = require("fs");
const { google } = require('googleapis');
const rw = require("../reader_writer.js");

module.exports = DownloadStream;

function DownloadStream(oAuth2Object, downloadPath)
{
    const drive = google.drive({ version:"v3", oAuth2Object });
    const writeStream = fs.createWriteStream(downloadPath);

    var onReadErrorHandler;
    var onReadEndHandler;
    var onReadCloseHandler;
    var onReadDataHandler;
    
    var onWriteErrorHandler;
    var onWriteFinishHandler;
    var onWriteCloseHandler;

    this.onReadError = (handler) => onReadErrorHandler = handler;
    this.onReadEnd = (handler) => onReadEndHandler = handler;
    this.onReadClose = (handler) => onReadCloseHandler = handler;
    this.onReadData = (handler) => onReadDataHandler = handler;
    
    this.onWriteError = (handler) => onWriteErrorHandler = handler;
    this.onWriteFinish = (handler) => onWriteFinishHandler = handler;
    this.onWriteClose = (handler) => onWriteCloseHandler = handler;

    this.startDownload = (getOptions, responseTypeOptions) =>
    {
        drive.files.get(getOptions, responseTypeOptions, (err, response) =>
        {
            var readStream;

            /*err.response has the following fields:
                {
                "status": 404,
                "statusText": "Not Found",
                "data": "Not Found"
                }
            */
            if (err)
                return onErrorHandler(new Error(`Response error: ${err.status} ${err.statusText}`));

            readStream = response.data;

            //add ReadStream handlers
            readStream.on('error', (err) => onReadErrorHandler(err));
            readStream.on('end', () => onReadEndHandler());
            readStream.on("close", () => onReadCloseHandler());
            readStream.on("data", (chunk) => onReadDataHandler(Buffer.byteLength(chunk)));
            
            //make sure the dest Writable is safe to write (i.e. no error occurred)
            if (writeStream.writable === false)
                return onErrorHandler(new Error(`Write stream is not in a writable state.`));


            rw.log("upload", "WriteStream is writable. Piping ReadStream into it.");

            //pipe response readable stream into our writestream. This returns the
            //writestream object so we can chain writestream event handlers into it
            readStream.pipe(writeStream)
            .on("error", (err) => onWriteErrorHandler(err))
            .on("finish", () => onWriteFinishHandler())
            .on("close", () => onWriteCloseHandler());
        });
    };
}