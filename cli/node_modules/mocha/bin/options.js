/**
 * Dependencies.
 */

var fs = require('fs');

/**
 * Export `getOptions`.
 */

module.exports = getOptions;

/**
 * Get options.
 */

function getOptions() {
  var optsPath = process.argv.indexOf('--opts') !== -1
        ? process.argv[process.argv.indexOf('--opts') + 1]
        : 'test/mocha.opts';

  try {
    var opts = fs.readFileSync(optsPath, 'utf8')
          .trim()
          .split(/\s+/)
          .filter(function(value) {
            return value ? true : false;
          });

    process.argv = process.argv
      .slice(0, 2)
      .concat(opts.concat(process.argv.slice(2)));
  } catch (err) {
    // ignore
  }
}
