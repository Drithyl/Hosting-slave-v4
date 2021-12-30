
const Counter = require("../counter.js");
const assert = require("../asserter.js");
const statusdumpFactory = require("./status_dump_wrapper.js");


module.exports = GameStatus;

function GameStatus(gameName)
{
    const _gameName = gameName;

    this.game = null;
    this.statusWrapper = null;
    this.counter = new Counter();
    this.uptime = 0;


    this.hasGameObject = () => this.game != null;
    this.setGameObject = (gameObject) =>
    {
        if (assert.isObject(gameObject) === true)
        {
            this.game = gameObject;
            _updateCounterStatus(this);
        }
    };

    this.hasStatusDump = () => this.statusWrapper != null;
    this.getStatusDump = () => this.statusWrapper;

    // Only call this method when this data will be used to
    // update the uptime on the master side. If it is used
    // for other calls, it will make timers go by slowly, as
    // a lot of uptime won't be used to update them
    this.consumeStatusDump = () =>
    {
        if (this.hasStatusDump() === false)
            return null;

        const consumedData = Object.assign(this.statusWrapper, { 
            uptime: (this.counter != null) ? this.counter.getUptime() : null,
            isOnline: (this.game != null) ? this.game.isOnline() : null
        });

        return consumedData;
    };

    this.updateStatus = async () =>
    {
        // If there is a StatusDump object available, use its update() method
        if (this.hasStatusDump() === true)
            await this.statusWrapper.update();

        // Ootherwise, try to fetch a new one parsing the savedgames data
        else if (this.statusWrapper == null)
            this.statusWrapper = await statusdumpFactory.fetchStatusDump(_gameName);

        // If there is still no status available, then return null
        if (this.statusWrapper == null)
            return null;

        // If there is a statusdump but no counter, create a new one
        // (Important on newly hosted games that spawned an instance
        // but don't yet have a savedgames folder with a statusdump)
        if (this.hasCounter() === false)
            this.counter = new Counter();


        // Update our counter status according to the state of the process
        _updateCounterStatus(this);

        return this.statusWrapper;
    };

    this.hasCounter = () => assert.isInstanceOfPrototype(this.counter, Counter);
    this.updateCounterStatus = () => _updateCounterStatus(this);
}

function _updateCounterStatus(gameStatusObject)
{
    if (gameStatusObject.hasCounter() === false)
        return;

    if (gameStatusObject.hasGameObject() === false)
        return;

    if (gameStatusObject.game.isOnline() === true)
        gameStatusObject.counter.start();

    else gameStatusObject.counter.stop();
}