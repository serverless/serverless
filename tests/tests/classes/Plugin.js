'use strict';

/**
 * Test: Plugin Function Class
 */

const expect = require('chai').expect;
const Serverless = require('../../../lib/Serverless');
const Plugin = require('../../../lib/classes/Plugin');

describe('Plugin', () => {

  let SPlugin;
  let serverless;

  beforeEach(() => {
    // create a new Serverless instance
    serverless = new Serverless({
      interactive: false,
    });
    
    SPlugin = new Plugin(serverless);
  });

  it('should return a valid name', () => {
    const name = SPlugin.getName();
    expect(name).to.be.equal('Plugin');
  });

  it('should register actions', () => {
    const actions = SPlugin.registerActions();
    return actions.then((result) => {
      expect(result).to.equal(undefined);
    });
  });

  it('should register hooks', () => {
    const hooks = SPlugin.registerHooks();
    return hooks.then((result) => {
      expect(result).to.equal(undefined);
    });
  });

  describe('#addAction()', () => {

    beforeEach(() => {
      SPlugin.addAction(actionMock, actionMockConfig);
      SPlugin.addAction(actionMock, actionMockConfigSimple);
    });

    const actionMock = () => { return { foo: 'bar' }; };
    const actionMockConfig = {
      handler: 'actionMock',
      context: 'action',
      contextAction: 'mock',
      options: [
        {
          option: 'mockOption',
          shortcut: 'm',
          description: 'Mock option',
        },
      ],
      parameters: [
        {
          parameter: 'mockParam',
          description: 'Mock param',
          position: '0->',
        },
      ],
    };
    const actionMockConfigSimple = {
      handler: 'actionMock',
      context: 'action2',
      contextAction: 'mock',
    };

    it('should have an empty options property', () => {
      expect(serverless.commands.action2.mock.options.length).to.equal(0);
    });

    it('should have an empty parameters property', () => {
      expect(serverless.commands.action2.mock.parameters.length).to.equal(0);
    });

    it('should have an options property', () => {
      expect(serverless.commands.action.mock).to.have.property('options');
    });

    it('should have an action property', () => {
      expect(serverless.actions).to.have.property('actionMock');
    });

    it('should have a mock property', () => {
      expect(serverless.commands.action).to.have.property('mock');
    });

    it('should have a parameters property', () => {
      expect(serverless.commands.action.mock).to.have.property('parameters');
    });

    it('should add a context action', () => {
      expect(serverless.commands.action.mock.contextAction).to.equal('mock');
    });

    it('should add a handler', () => {
      expect(serverless.commands.action.mock.handler).to.equal('actionMock');
    });

    it('should add a context', () => {
      expect(serverless.commands.action.mock.context).to.equal('action');
    });

    it('should have a specified options array', () => {
      expect(serverless.commands.action.mock.options.length).to.equal(1);
    });

    it('should have an option inside the options array', () => {
      expect(serverless.commands.action.mock.options[0].option).to.equal('mockOption');
    });

    it('should have a shortcut inside the options array', () => {
      expect(serverless.commands.action.mock.options[0].shortcut).to.equal('m');
    });

    it('should have a description inside the options array', () => {
      expect(serverless.commands.action.mock.options[0].description).to.equal('Mock option');
    });

    it('should have a specified parameters array', () => {
      expect(serverless.commands.action.mock.parameters.length).to.equal(1);
    });

    it('should have a parameter inside the parameters array', () => {
      expect(serverless.commands.action.mock.parameters[0].parameter).to.equal('mockParam');
    });

    it('should have a description inside the parameters array', () => {
      expect(serverless.commands.action.mock.parameters[0].description).to.equal('Mock param');
    });

    it('should have a position inside the parameters array', () => {
      expect(serverless.commands.action.mock.parameters[0].position).to.equal('0->');
    });

    it('should run the specified action', () => {
      const actionRunMock = () => { return { foo: 'bar' }; };
      const actionRunMockConfig = {
        handler: 'actionRunMock',
        context: 'actionrun',
        contextAction: 'mock',
      };

      SPlugin.addAction(actionRunMock, actionRunMockConfig);

      return serverless.actions.actionRunMock({ baz: 'qux' }).then((evt) => {
        expect(evt).to.have.property('foo');
      });
    });

  });

  describe('#addHook()', () => {

    describe('when adding a pre hook', () => {

      const preHookMock = () => {
        return true;
      };
      const preHookMockConfig = {
        action: 'actionMock',
        event: 'pre',
      };
      const actionMock = () => { return { foo: 'bar' }; };
      const actionMockConfig = {
        handler: 'actionMock',
        context: 'action',
        contextAction: 'mock',
      };

      beforeEach(() => {
        SPlugin.addAction(actionMock, actionMockConfig);
        SPlugin.addHook(preHookMock, preHookMockConfig);
      });

      it('should have a specified preHooks array', () => {
        expect(serverless.hooks.actionMockPre.length).to.equal(1);
      });

      it('should have an empty postHooks array', () => {
        expect(serverless.hooks.actionMockPost.length).to.equal(0);
      });

      it('should have a function as a pre hook', () => {
        expect(serverless.hooks.actionMockPre[0]).to.be.a('function');
      });

    });

    describe('When adding a post hook', () => {

      const postHookMock = () => {
        return true;
      };
      const postHookMockConfig = {
        action: 'actionMock',
        event: 'post',
      };
      const actionMock = () => { return { foo: 'bar' }; };
      const actionMockConfig = {
        handler: 'actionMock',
        context: 'action',
        contextAction: 'mock',
      };

      beforeEach(() => {
        SPlugin.addAction(actionMock, actionMockConfig);
        SPlugin.addHook(postHookMock, postHookMockConfig);
      });

      it('should have a specified postHooks array', () => {
        expect(serverless.hooks.actionMockPost.length).to.equal(1);
      });

      it('should have an empty preHooks array', () => {
       expect(serverless.hooks.actionMockPre.length).to.equal(0);
      });

      it('should have a function as a post hook', () => {
        expect(serverless.hooks.actionMockPost[0]).to.be.a('function');
      });

    });
  });

});
