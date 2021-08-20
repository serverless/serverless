'use strict';
const { expect } = require('chai');
const promiseMap = require('../../../../lib/utils/promiseMap');

// adjusted from  https://github.com/rxaviers/async-pool
// skipped by default due to the execution time

describe.skip('promiseMap', () => {
  it('as many promises in parallel as given by the pool limit', async () => {
    const results = [];
    const timeout = (i) =>
      new Promise((resolve) =>
        setTimeout(() => {
          results.push(i);
          resolve();
        }, i)
      );
    await promiseMap([100, 500, 300, 200], timeout, { concurrency: 2 });
    expect(results).to.deep.equal([100, 300, 500, 200]);
  });

  it('runs all promises in parallel when the pool is bigger than needed', async () => {
    const results = [];
    const timeout = (i) =>
      new Promise((resolve) =>
        setTimeout(() => {
          results.push(i);
          resolve();
        }, i)
      );
    await promiseMap([100, 500, 300, 200], timeout, { concurrency: 5 });
    expect(results).to.deep.equal([100, 200, 300, 500]);
  });

  it('rejects on error (but does not leave unhandled rejections)', async () => {
    const timeout = () => Promise.reject();
    return expect(promiseMap([100, 500, 300, 200], timeout)).to.be.rejected;
    // check console - no UnhandledPromiseRejectionWarning should appear
  });

  it('rejects as soon as first promise rejects', async () => {
    const startedTasks = [];
    const finishedTasks = [];
    const timeout = (i) => {
      startedTasks.push(i);
      return new Promise((resolve, reject) =>
        setTimeout(() => {
          if (i === 300) {
            reject(new Error('Oops'));
          } else {
            finishedTasks.push(i);
            resolve();
          }
        }, i)
      );
    };

    const testResult = await expect(promiseMap([100, 500, 300, 200], timeout, { concurrency: 2 }))
      .to.be.rejected;

    expect(startedTasks).to.deep.equal([100, 500, 300]);
    expect(finishedTasks).to.deep.equal([100]);

    // tasks started before the error will continue, though - just wait a bit
    await new Promise((resolve) => setTimeout(() => resolve(), 500));
    expect(startedTasks).to.deep.equal([100, 500, 300]);
    expect(finishedTasks).to.deep.equal([100, 500]);

    return testResult;
  });
});
