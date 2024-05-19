module.exports = class PermissionsError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = "PermissionsError";
  }
};
