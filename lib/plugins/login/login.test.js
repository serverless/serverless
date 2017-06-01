'use strict';

const expect = require('chai').expect;
const Login = require('./login');
const Serverless = require('../../Serverless');

describe('Login', () => {
  let login;
  let serverless;

  beforeEach(() => {
    serverless = new Serverless();
    login = new Login(serverless);
  });

  describe('#constructor()', () => {
    it('should have commands', () => expect(login.commands).to.be.not.empty);
  });
});
