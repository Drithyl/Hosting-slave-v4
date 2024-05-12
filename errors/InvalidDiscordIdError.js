module.exports = class InvalidDiscordIdError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = "InvalidDiscordIdError";
  }
};
