module.exports.individual = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Individual Node.js function' }),
  }
}

module.exports.shared = async (event) => {
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'Shared Node.js function' }),
  }
}
