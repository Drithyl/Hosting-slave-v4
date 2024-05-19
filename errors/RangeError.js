module.exports = class RangeError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = "RangeError";
  }
};
