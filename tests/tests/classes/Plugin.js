'use strict';

/**
 * Test: Plugin Function Class
 */

const expect = require('chai').expect;
const Plugin = require('../../../lib/classes/Plugin')({});

const SPlugin = new Plugin();

describe('Plugin class', () => {

  after((done) => {
    done();
  });

  it('should have a name', () => {
    const name = SPlugin.getName();

    expect(name.length).to.be.at.least(1);
  });

  it('should register actions', () => {
    const actions = SPlugin.registerActions();

    // note: use return when testing promises otherwise you'll have unhandled rejection errors
    return actions.then((result) => {
      expect(result).to.equal(undefined);
    });
  });

  it('should register hooks', () => {
    const hooks = SPlugin.registerHooks();

    // note: use return when testing promises otherwise you'll have unhandled rejection errors
    return hooks.then((result) => {
      expect(result).to.equal(undefined);
    });
  });

});
