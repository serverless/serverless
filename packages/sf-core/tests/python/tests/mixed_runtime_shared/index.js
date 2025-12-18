const _ = require('lodash')

exports.handler = async (event) => {
  const ok = _.isArray([])
  return {
    statusCode: 200,
    body: 'Node.js function ' + (ok ? 'with lodash' : 'without lodash'),
  }
}
