const fs = require("fs");
const fsp = fs.promises;
const pathUtilities = require("../utilities/path-utilities");
const typeUtilities = require("../utilities/type-utilities");

/**
 * Represents the different possible commands that can be written into a domcmd file
 * within a game's savedgames folder for Dominions to consume and to change the game's
 * timer, ascension points, cataclysm, etc.
 */
module.exports = class {
    #defaultTurnTimer;
    #turnTimeLeft;
    #ap;
    #cataclysmTurn;

    get defaultTurnTimer() {
        return this.#defaultTurnTimer;
    }

    get turnTimeLeft() {
        return this.#turnTimeLeft;
    }

    get ap() {
        return this.#ap;
    }

    get cataclysmTurn() {
        return this.#cataclysmTurn;
    }

    // Default turn timer in domcmd commands is expressed in minutes, whereas the time
    // left is expressed in seconds. For convenience's sake, we'll expect both as seconds,
    // and then convert the value to the appropriate one in the setters.
    setDefaultTurnTimer(turnTimerInMs) {
        if (typeUtilities.isNumberInRange(turnTimerInMs, 0, Infinity) === true) {
            this.#defaultTurnTimer = turnTimerInMs / 60000;
        }
        return this;
    }

    setTurnTimeLeft(timeLeftInMs) {
        if (typeUtilities.isNumberInRange(timeLeftInMs, 0, Infinity) === true) {
            this.#turnTimeLeft = timeLeftInMs / 1000;
        }
        return this;
    }

    setAp(ascensionPointsRequired) {
        if (typeUtilities.isNumberInRange(ascensionPointsRequired, 1, 80) === true) {
            this.#ap = ascensionPointsRequired;
        }
        return this;
    }

    setCataclysmTurn(turn) {
        if (typeUtilities.isNumberInRange(turn, 1, 999) === true) {
            this.#cataclysmTurn = turn;
        }
        return this;
    }

    toString() {
        let domCmdString = "";

        if (this.#defaultTurnTimer != null) {
            domCmdString += `setinterval ${this.#defaultTurnTimer}\n`;
        }

        if (this.#turnTimeLeft != null) {
            domCmdString += `settimeleft ${this.#turnTimeLeft}\n`;
        }

        if (this.#ap != null) {
            domCmdString += `forcereqap ${this.#ap}\n`;
        }

        if (this.#cataclysmTurn != null) {
            domCmdString += `forcecattrn ${this.#cataclysmTurn}\n`;
        }

        return domCmdString;
    }

    async writeFile(gameName, gameType) {
        const domCmdString = this.toString();
        const gameSavePath = pathUtilities.getGameSavePath(gameName, gameType);
        const domCmdPath = pathUtilities.getGameDomCmdPath(gameName, gameType);

        if (fs.existsSync(gameSavePath) === false) {
            throw new Error(`Savedgames directory at "${gameSavePath}" does not exist`);
        }

        await fsp.writeFile(domCmdPath, domCmdString);
    }
}
