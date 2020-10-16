
Array.prototype.forEachAsync = function(asyncFn, callback)
{
  var index = 0;

  //the context of 'this' will change in the loop
  var array = this;

  (function loop()
  {
    if (index >= array.length)
    {
      if (callback != null)
      {
        callback();
      }

      return;
    }

    asyncFn(array[index], index++, function()
    {
      loop();
    });
  })();
};

Array.prototype.forEachPromise = function(asyncFn, callback)
{
  var index = 0;

  //the context of 'this' will change in the loop
  var array = this;

  return new Promise((resolve) =>
  {
    (function loop()
    {
      if (index >= array.length)
      {
        if (typeof callback === "function")
          return callback();

        else return resolve();
      }

      asyncFn(array[index], index++, () => loop());
    })();
  });
};

Object.defineProperty(Object.prototype, "forEachPromise",
{
  value: function(asyncFn)
  {
    var array = this.convertToArray();

    return array.forEachPromise(asyncFn);
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
