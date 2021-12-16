
module.exports = Counter;

function Counter()
{
    var _lastStarted = 0;
    var _lastStopped = 0;
    var _lastChecked = Date.now();

    var _totalUptime = 0;
    var _uptimeSinceLast = 0;
    var _isStarted = false;
    

    this.start = () => 
    {
        if (_isStarted === true)
            return;

        _lastStarted = Date.now();
        _isStarted = true;
    };

    this.stop = () =>
    {
        if (_isStarted === false)
            return;

        const elapsedSinceStarted = _elapsedSince();
        _totalUptime += Math.max(elapsedSinceStarted, 0);
        _uptimeSinceLast += Math.max(elapsedSinceStarted, 0);
        _lastChecked = Date.now();
        _isStarted = false;
    };

    this.getUptime = () =>
    {
        var returnedUptime = 0;

        if (_isStarted === false)
            returnedUptime = _uptimeSinceLast;

        else
        {
            // Get elapsed uptime since last check; this includes
            // _uptimeSinceLast which might have built up after
            // intervals of start() and stop()
            returnedUptime = _elapsedSince() + _uptimeSinceLast;
            _totalUptime += returnedUptime;

            // Reset values
            _lastChecked = Date.now();
        }
        
        _uptimeSinceLast = 0;
        return returnedUptime;
    };

    // Takes the latest timestamp, either last checked uptime
    // or the last time since it was started, and then compares
    // to the time now to figure out how many ms have passed
    function _elapsedSince()
    {
        const latestTimestamp = Math.max(_lastStarted, _lastChecked);
        return Date.now() - latestTimestamp;
    }
}

// _lastStarted at 1000
// _lastChecked at 1200
// Date.now() is 1500
// New uptime should be 1500 - 1200 = 300