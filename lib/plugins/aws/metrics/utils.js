'use strict';

module.exports = {
  getRoundedAvgDuration: (duration, functionsCount) =>
    (Math.round(duration * 100) / 100) / functionsCount,

  reduceDatapoints: (datapoints, statistic) => datapoints
    .reduce((previous, datapoint) => previous + datapoint[statistic], 0),
};
