'use strict';

// adjusted from  https://github.com/rxaviers/async-pool
module.exports = async function (
  values,
  iteratorFn,
  { concurrency = Number.POSITIVE_INFINITY } = {}
) {
  const result = [];
  const executing = [];
  for (const value of values) {
    const started = Promise.resolve().then(() => iteratorFn(value, values));
    result.push(started);

    if (concurrency <= values.length) {
      const withTracking = started.then(() => executing.splice(executing.indexOf(withTracking), 1));
      executing.push(withTracking);
      if (executing.length >= concurrency) {
        await Promise.race(executing);
      }
    }
  }
  return Promise.all(result);
};
