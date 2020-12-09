'use strict';

async function sleep(interval = 0) {
  await new Promise(resolve => setTimeout(resolve, interval));
}

module.exports = {
  sleep,
};
