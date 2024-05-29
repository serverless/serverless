export const cfValue = (value) => {
  return {
    anyOf: [
      value,
      { $ref: '#/definitions/awsCfFunction' },
      { $ref: '#/definitions/awsCfIf' },
    ],
  }
}
