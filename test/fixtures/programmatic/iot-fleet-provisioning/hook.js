'use strict';

module.exports.main = (_event, _context, callback) => {
  callback(null, { allowProvisioning: true });
};
