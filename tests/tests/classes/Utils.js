'use strict';

/**
 * Test: Serverless Function Class
 */

const assert = require('chai').assert,
	    Utils = require('../../../lib/classes/Utils')({});


let SUtils = new Utils();

describe('Test Utils Class', () => {

  after((done) => {
    done();
  });

  it('Test Export Object', () => {
    const data = {
      class: 'SampleClass',
      publicProp: 'somethingPublic',
      functionProp: () => {}
    };

    const Obj = SUtils.exportObject(data);
		assert.equal(Obj.publicProp, 'somethingPublic');
		assert.equal(typeof Obj._class, 'undefined');
		assert.equal(typeof Obj.functionProp, 'undefined');
	});

});
