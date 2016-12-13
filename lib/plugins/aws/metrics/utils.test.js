'use strict';

const expect = require('chai').expect;

const getRoundedAvgDuration = require('./utils').getRoundedAvgDuration;
const reduceDatapoints = require('./utils').reduceDatapoints;

describe('#getRoundedAvgDuration()', () => {
  it('should return the rounded average duration', () => {
    const duration = 2000.0000023;
    const functionsCount = 2;

    const result = getRoundedAvgDuration(duration, functionsCount);

    expect(result).to.equal(1000);
  });
});

describe('#reduceDatapoints()', () => {
  it('should reduce the given datapoints based on the statistic', () => {
    const datapoints = [{ Sum: 12 }, { Sum: 8 }, { Sum: 5 }];
    const statistic = 'Sum';

    const result = reduceDatapoints(datapoints, statistic);

    expect(result).to.equal(25);
  });

  it('should return 0 if no datapoints are available to reduce', () => {
    const datapoints = [];
    const statistic = '';

    const result = reduceDatapoints(datapoints, statistic);

    expect(result).to.equal(0);
  });
});
