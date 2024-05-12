module.exports = class LengthError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = "LengthError";
  }
};
