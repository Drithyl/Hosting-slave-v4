module.exports = class SemanticError extends Error
{
  constructor(message)
  {
    super(message);
    this.name = "SemanticError";
  }
};
