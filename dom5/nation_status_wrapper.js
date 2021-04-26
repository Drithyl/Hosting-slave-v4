
module.exports = NationStatusWrapper;

function NationStatusWrapper(nationRawData)
{
    const _parsedData = _parseNationRawData(nationRawData);

    this.filename = _parsedData.filename;
    this.fullName = _parsedData.fullName;
    this.shortName = _parsedData.shortName;
    
    //the nation number
    this.nationNbr = _parsedData.nationNbr;

    //the number of the pretender of this team (so if it's not the same as the nation nbr, this is a disciple)
    this.pretenderNbr = _parsedData.pretenderNbr;
    
    //controller of the nation. 0 is ai, 1 is human, 2 is ai (seems like the "went AI this turn" flag does not work)
    this.isHuman = (_parsedData.controller === 1) ? true : false;
    this.isAi = (_parsedData.controller === 2) ? true : false;

    //from 0 to 5: easy, normal, difficult, mighty, master, impossible
    this.aiDifficultyNbr = _parsedData.aiDifficultyNbr;

    //0 is turn not checked, 1 is marked as unfinished, 2 is turn done
    this.wasTurnChecked = (_parsedData.turnStatus === 0) ? false : true;
    this.isTurnUnfinished = (_parsedData.turnStatus === 1) ? true : false;
    this.isTurnFinished = (_parsedData.turnStatus === 2) ? true : false;
}

function _parseNationRawData(nationRawData)
{
    const data = {};
    const nationNumbers = _extractNationNumbers(nationRawData);
    const nationFilename = _extractNationFilename(nationRawData);
    const nationFullName = _extractNationFullName(nationRawData);
    const nationShortName = _extractNationShortName(nationRawData);

    data.filename = nationFilename;
    data.fullName = nationFullName;
    data.shortName = nationShortName;

    data.nationNbr = +nationNumbers[0];
    data.pretenderNbr = +nationNumbers[1];
    data.controller = +nationNumbers[2];
    data.aiDifficultyNbr = +nationNumbers[3];
    data.turnStatus = +nationNumbers[4];

    return data;
}

function _extractNationFilename(rawData)
{
    const words = _extractNationWords(rawData);

    return words[0];
}

function _extractNationFullName(rawData)
{
    const words = _extractNationWords(rawData);
    const nameAndSubtitle = words.slice(1);
    const name = nameAndSubtitle.shift();
    const subtitle = nameAndSubtitle.join(" ");

    return `${name}, ${subtitle}`;
}

function _extractNationShortName(rawData)
{
    const fullName = _extractNationFullName(rawData);

    return fullName.slice(0, fullName.indexOf(","));
}

function _extractNationWords(rawData)
{
    return rawData.replace(/^Nation\s*(\d+\s+)+/ig, "").split(/\t+/);
}

function _extractNationNumbers(rawData)
{
    return rawData.match(/\d+/ig);
}