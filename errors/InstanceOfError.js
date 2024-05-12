module.exports = class InstanceOfError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = "InstanceOfError";
  }
};
