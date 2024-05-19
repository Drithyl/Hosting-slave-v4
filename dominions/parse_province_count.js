
const log = require("../logger.js");

module.exports = function(mapData)
{
	let provLines;
	let terrainMask;
	let provCount = {total: 0, land: 0, sea: 0};

	if (mapData == null)
	{
		log.error(log.getNormalLevel(), "mapData PROVIDED IS NULL");
		return null;
	}

	if (/\w+/.test(mapData) == false)
	{
		log.error(log.getNormalLevel(), "mapData CONTAINS NO WORDS");
		return null;
	}

	if (/\#terrain\s+\d+\s+\d+/ig.test(mapData) === false)
	{
		log.error(log.getNormalLevel(), "mapData CONTAINS NO #terrain TAGS");
		return null;
	}

	provLines = mapData.match(/\#terrain\s+\d+\s+\d+/g);

	for (let i = 0; i < provLines.length; i++)
	{
		terrainMask = +provLines[i].slice(provLines[i].indexOf(" ", provLines[i].indexOf(" ") + 1) + 1).replace(/\D/g, "");

		//4 is the sea flag
		if (terrainMask & 4)
		{
			provCount.sea++;
		}
	}

	provCount.total = provLines.length;
	provCount.land = provCount.total - provCount.sea;
	return provCount;
};
