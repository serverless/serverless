module.exports = process.env.COV
  ? require('./lib-cov/mocha')
  : require('./lib/mocha');
