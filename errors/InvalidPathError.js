module.exports = class InvalidPathError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = "InvalidPathError";
  }
};
