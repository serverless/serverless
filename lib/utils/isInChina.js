'use strict';

if (process.env.SLS_GEO_LOCATION === 'cn') {
  module.exports = true;
  return;
}

module.exports = new Intl.DateTimeFormat('en', { timeZoneName: 'long' })
  .format()
  .includes('China Standard Time');
