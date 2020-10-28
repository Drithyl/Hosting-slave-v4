

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

            asyncFn(array[index], index++, () => loop())
            .catch((err) => reject(err));
		})();
	});
};

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
                .catch((err) => reject(err));
            })();
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
