const updateNotifier = require('update-notifier');
const pkg = require('../../package.json');

module.exports = {
  check: () => {
    updateNotifier({ pkg }).notify();
  },
};
