module.exports.Counter = class Counter {
    #lastStarted = 0;
    #lastChecked = Date.now();
    #totalUptime = 0;
    #uptimeSinceLast = 0;
    #isStarted = false;

    start = () => 
    {
        if (this.#isStarted === true)
            return;

        this.#lastStarted = Date.now();
        this.#isStarted = true;
    };

    stop = () =>
    {
        if (this.#isStarted === false)
            return;

        const elapsedSinceStarted = this.#elapsedSince();
        this.#totalUptime += Math.max(elapsedSinceStarted, 0);
        this.#uptimeSinceLast += Math.max(elapsedSinceStarted, 0);
        this.#lastChecked = Date.now();
        this.#isStarted = false;
    };

    getUptime = () =>
    {
        let returnedUptime = 0;

        if (this.#isStarted === false)
            returnedUptime = this.#uptimeSinceLast;

        else
        {
            // Get elapsed uptime since last check; this includes
            // #uptimeSinceLast which might have built up after
            // intervals of start() and stop()
            returnedUptime = this.#elapsedSince() + this.#uptimeSinceLast;
            this.#totalUptime += returnedUptime;

            // Reset values
            this.#lastChecked = Date.now();
        }
        
        this.#uptimeSinceLast = 0;
        return returnedUptime;
    };

    // Takes the latest timestamp, either last checked uptime
    // or the last time since it was started, and then compares
    // to the time now to figure out how many ms have passed
    #elapsedSince()
    {
        const latestTimestamp = Math.max(this.#lastStarted, this.#lastChecked);
        return Date.now() - latestTimestamp;
    }
};
