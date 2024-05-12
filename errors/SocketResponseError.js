module.exports = class SocketResponseError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = "SocketResponseError";
  }
};
