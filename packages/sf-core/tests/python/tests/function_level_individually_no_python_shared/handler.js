module.exports.function1 = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Node.js function 1' }),
  }
}

module.exports.function2 = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Node.js function 2' }),
  }
}
