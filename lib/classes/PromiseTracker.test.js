'use strict';

/* eslint-disable no-unused-expressions */

const BbPromise = require('bluebird');
const chai = require('chai');

const PromiseTracker = require('../../lib/classes/PromiseTracker');

chai.use(require('chai-as-promised'));

const expect = chai.expect;

/**
 * Mostly this class is tested by its use in peer ~/lib/classes/Variables.js
 *
 * Mostly, I'm creating coverage but if errors are discovered, coverage for the specific cases
 * can be created here.
 */
describe('PromiseTracker', () => {
  let promiseTracker;
  beforeEach(() => {
    promiseTracker = new PromiseTracker();
  });
  it('logs a warning without throwing', () => {
    promiseTracker.add('foo', BbPromise.resolve(), '${foo:}');
    promiseTracker.add('foo', BbPromise.delay(10), '${foo:}');
    promiseTracker.report(); // shouldn't throw
  });
  it('reports no pending promises when none have been added', () => {
    const promises = promiseTracker.getPending();
    expect(promises).to.be.an.instanceof(Array);
    expect(promises.length).to.equal(0);
  });
  it('reports one pending promise when one has been added', () => {
    let resolve;
    const promise = new BbPromise((rslv) => { resolve = rslv; });
    promiseTracker.add('foo', promise, '${foo:}');
    return BbPromise.delay(1).then(() => {
      const promises = promiseTracker.getPending();
      expect(promises).to.be.an.instanceof(Array);
      expect(promises.length).to.equal(1);
      expect(promises[0]).to.equal(promise);
    }).then(() => { resolve(); });
  });
  it('reports no settled promises when none have been added', () => {
    const promises = promiseTracker.getSettled();
    expect(promises).to.be.an.instanceof(Array);
    expect(promises.length).to.equal(0);
  });
  it('reports one settled promise when one has been added', () => {
    const promise = BbPromise.resolve();
    promiseTracker.add('foo', promise, '${foo:}');
    promise.state = 'resolved';
    const promises = promiseTracker.getSettled();
    expect(promises).to.be.an.instanceof(Array);
    expect(promises.length).to.equal(1);
    expect(promises[0]).to.equal(promise);
  });
  it('reports no promises when none have been added', () => {
    const promises = promiseTracker.getAll();
    expect(promises).to.be.an('array').that.is.empty;
  });
});
