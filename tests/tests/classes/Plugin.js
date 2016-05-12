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

  it('should register actions', (done) => {
    const actions = SPlugin.registerActions();

    actions.then((result) => {
      done();
    }).catch((error) => {
      done(new Error(error));
    });
  });

  it('should register hooks', (done) => {
    const hooks = SPlugin.registerHooks();

    hooks.then((result) => {
      done();
    }).catch((error) => {
      done(new Error(error));
    });
  });

});
