const { EventEmitter } = require("ws");
const spawn = require("child_process").spawn;

class DominionsProcess extends EventEmitter {
    process;
    isStarting = false;
    spawnedSuccessfully = false;

    constructor() {
        super();
        this.setMaxListeners(5);
        this.on('error', _handleError);
    }

    start(launchPath, domLaunchOptions, spawnOptions) {
        this.isStarting = true;
        this.process = spawn(launchPath, domLaunchOptions, {
            stdio: ["ignore", "ignore", "pipe"]
        });

        this.process.on("error", () => this.emit("error", arguments));
        this.process.on("close", () => this.emit("close", arguments));

        this.process.on("exit", () => {
            this.isStarting = false;
            this.emit("exit", arguments)
        });


        this.process.on("spawn", () => {
            this.isStarting = false;
            this.spawnedSuccessfully = true;
            this.emit("spawn", arguments)
        });
        
        if (this.process.stderr != null) {
            this.process.stderr.setEncoding("utf8");
            this.process.stderr.on("error", () => this.emit("stderrError", arguments));
            this.process.stderr.on("data", () => this.emit("stderrData", arguments));
        }
        
        if (this.process.stdout != null) {
            this.process.stdout.setEncoding("utf8");
            this.process.stdout.on("error", () => this.emit("stdoutError", arguments));
            this.process.stdout.on("data", () => this.emit("stdoutData", arguments));
        }
    }
}

class DominionsProcessArgs {
    gameName;
    gameType;
    launchPath;
    launchOptions;

    constructor(gameName, gameType, launchPath, launchOptions) {
        this.gameName = gameName;
        this.gameType = gameType;
        this.launchPath = launchPath;
        this.launchOptions = launchOptions;
    }
}

function _handleError(err) {
    console.error("[DominionsProcess], err.message");
}
