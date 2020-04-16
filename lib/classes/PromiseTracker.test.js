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
    return Promise.all(promiseTracker.getAll());
  });
  it('reports no promises when none have been added', () => {
    expect(promiseTracker.getAll()).to.be.an('array').that.is.empty;
    expect(promiseTracker.getPending()).to.be.an('array').that.is.empty;
    expect(promiseTracker.getSettled()).to.be.an('array').that.is.empty;
    expect(promiseTracker.getResolved()).to.be.an('array').that.is.empty;
    expect(promiseTracker.getRejected()).to.be.an('array').that.is.empty;
  });
  it('reports the correct number of added promise statuses', () => {
    let resolve;
    const pending = new BbPromise(rslv => {
      resolve = rslv;
    });
    const resolved = BbPromise.resolve();
    const rejected = BbPromise.reject('reason');
    promiseTracker.add('pending', pending, '${pending:}');
    promiseTracker.add('resolved', resolved, '${resolved:}');
    promiseTracker.add('rejected', rejected, '${rejected:}');
    resolved.state = 'resolved';
    rejected.state = 'rejected';
    return BbPromise.delay(1)
      .then(() => {
        const pendings = promiseTracker.getPending();
        expect(pendings).to.be.an.instanceof(Array);
        expect(pendings.length).to.equal(1);
        expect(pendings[0]).to.equal(pending);
        const settleds = promiseTracker.getSettled();
        expect(settleds).to.be.an.instanceof(Array);
        expect(settleds.length).to.equal(2);
        expect(settleds).to.include(resolved);
        expect(settleds).to.include(rejected);
        const resolveds = promiseTracker.getResolved();
        expect(resolveds).to.be.an.instanceof(Array);
        expect(resolveds.length).to.equal(1);
        expect(resolveds).to.include(resolved);
        const rejecteds = promiseTracker.getRejected();
        expect(rejecteds).to.be.an.instanceof(Array);
        expect(rejecteds.length).to.equal(1);
        expect(rejecteds).to.include(rejected);
      })
      .then(() => {
        resolve();
      });
  });
  it('reports and then clears tracked promises when stopped after reporting.', () => {
    let resolve;
    const pending = new BbPromise(rslv => {
      resolve = rslv;
    });
    const resolved = BbPromise.resolve();
    const rejected = BbPromise.reject('reason');
    promiseTracker.add('pending', pending, '${pending:}');
    promiseTracker.add('resolved', resolved, '${resolved:}');
    promiseTracker.add('rejected', rejected, '${rejected:}');
    resolved.state = 'resolved';
    rejected.state = 'rejected';
    promiseTracker.reported = true;
    return BbPromise.delay(1).then(() => {
      const all = promiseTracker.getAll();
      expect(all).to.be.an.instanceof(Array);
      expect(all.length).to.equal(3);
      promiseTracker.stop();
      const stopped = promiseTracker.getAll();
      expect(stopped).to.be.an.instanceof(Array);
      expect(stopped.length).to.equal(0);
      resolve();
    });
  });
});
