'use strict'
/* eslint-env mocha */
const chai = require('chai')
const renderer = require('./analysisRenderers')

const expect = chai.expect

describe('AWSPlan analysis renderers module', () => {

  describe('#renderAction', () => {

    it('should render Add action', () => {
      const value = renderer.renderAction({ Action: 'Add' });
      expect(value).to.equal('[+]');
    })

    it('should render Remove action', () => {
      const value = renderer.renderAction({ Action: 'Remove' });
      expect(value).to.equal('[-]');
    })

    it('should render Modify action', () => {
      const value = renderer.renderAction({ Action: 'Modify' });
      expect(value).to.equal('[*]');
    })

  });

  describe('#renderResourceSummary', () => {

    it('should render PhysicalResourceId if present', () => {
      const value = renderer.renderResourceSummary({
        PhysicalResourceId: 'foo',
        LogicalResourceId: 'bar',
        ResourceType: 'baz'
      });
      expect(value).to.equal('bar - foo (baz)');
    })

    it('should hide PhysicalResourceId if not present', () => {
      const value = renderer.renderResourceSummary({
        LogicalResourceId: 'bar',
        ResourceType: 'baz'
      });
      expect(value).to.equal('bar (baz)');
    })

  });

  describe('#renderRecreation', () => {

    it('should render Recreation.Always', () => {
      const value = renderer.renderRecreation({
        Target: {
          RequiresRecreation: 'Always'
        }
      });
      expect(value).to.equal(' [Recreation: Always]');
    })

    it('should render Recreation.Conditionally', () => {
      const value = renderer.renderRecreation({
        Target: {
          RequiresRecreation: 'Conditionally'
        }
      });
      expect(value).to.equal(' [Recreation: Conditional]');
    })

    it('should render Recreation.Never', () => {
      const value = renderer.renderRecreation({
        Target: {
          RequiresRecreation: 'Never'
        }
      });
      expect(value).to.equal('');
    })

  });

  describe('#renderKeyValueChange', () => {

    it('should render old value if present', () => {
      const value = renderer.renderKeyValueChange({ 
        Key: 'foo',
        Value: 'bar',
        OldValue: 'baz'
      });
      expect(value).to.equal('foo: baz --> bar');
    })

    it('should hide old value if not present', () => {
      const value = renderer.renderKeyValueChange({ 
        Key: 'foo',
        Value: 'bar'
      });
      expect(value).to.equal('foo: bar');
    })

  });

})
