module.exports = class TypeError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = "TypeError";
  }
};
