

Array.prototype.forEachPromise = function(asyncFn, callback)
{
	var index = 0;

	//the context of 'this' will change in the loop
	var array = this;

	return new Promise((resolve, reject) =>
	{
		(function loop()
		{
			if (index >= array.length)
			{
				if (typeof callback === "function")
					return callback();

				else return resolve();
			}

            Promise.resolve(asyncFn(array[index], index++, () => loop()))
            .catch((err) => 
            {
                index++;
                reject(err);
            });
		})();
	});
};

Array.prototype.forAllPromises = function(asyncFn, breakOnError = true)
{
    var self = this;
    var results = [];
    var left = self.length;

    if (left <= 0)
        return Promise.resolve([]);

    return new Promise((resolve) =>
    {
        var errorOccurred = false;

        for (var i = 0; i < left; i++)
        {
            var item = self[i];

            Promise.resolve(asyncFn(item, i, self))
            .then((result) =>
            {
                if (breakOnError === false || errorOccurred === false)
                {
                    left--;
                    results.push(result);

                    if (left <= 0)
                        resolve(results);
                }
            })
            .catch((err) =>
            {
                if (breakOnError === true)
                {
                    errorOccurred = true;
                    reject(err, results);
                }

                else
                {
                    left--;
                    results.push(err);

                    if (left <= 0)
                        resolve(results);
                }
            });
        }
    });
};

Object.defineProperty(Object.prototype, "forEachItem",
{
    value: function(asyncFn)
    {
        var self = this;
        var keyArray = Object.keys(self);

        //Pass the item, the key to the item, and the object
        keyArray.forEach((key, index) => asyncFn(self[key], keyArray[index], self));
    }
});

Object.defineProperty(Object.prototype, "forEachPromise",
{
    value: function(asyncFn)
    {
        var index = 0;
        var self = this;
        var keyArray = Object.keys(self);

        return new Promise((resolve, reject) =>
        {
            (function loop()
            {
                if (index >= keyArray.length)
                    return resolve();

                //Pass the item, the key to the item, and the function to move to the next promise
                Promise.resolve(asyncFn(self[keyArray[index]], keyArray[index++], () => loop()))
                .catch((err) => 
                {
                    index++;
                    reject(err);
                });
            })();
        });
    }
});

Object.defineProperty(Object.prototype, "forAllPromises",
{
    value: function(asyncFn, breakOnError = true)
    {
        var self = this;
        var results = [];
        var keyArray = Object.keys(self);
        var left = keyArray.length;

        if (left <= 0)
            return Promise.resolve([]);

        return new Promise((resolve, reject) =>
        {
            for (var i = 0; i < left; i++)
            {
                var key = keyArray[i];
                var item = self[key];

                Promise.resolve(asyncFn(item, key, self))
                .then((result) =>
                {
                    if (breakOnError === false || errorOccurred === false)
                    {
                        left--;
                        results.push(result);

                        if (left <= 0)
                            resolve(results);
                    }
                })
                .catch((err) =>
                {
                    if (breakOnError === true)
                    {
                        errorOccurred = true;
                        reject(err, results);
                    }

                    else
                    {
                        left--;
                        results.push(err);

                        if (left <= 0)
                            resolve(results);
                    }
                });
            }
        });
    }
});

String.prototype.extract = function(regex)
{
	const match = this.match(regex)[0];
	const splitArr = this.split(regex);
	const extractedStr = splitArr[splitArr.indexOf(match)];

	if (match == null)
		return "";

	return extractedStr;
};
