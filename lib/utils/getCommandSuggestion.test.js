'use strict';

const chai = require('chai');
const getCommandSuggestion = require('./getCommandSuggestion');
chai.use(require('chai-as-promised'));
const expect = require('chai').expect;
const Serverless = require('../../lib/Serverless');

const serverless = new Serverless();
serverless.init();

describe('#getCommandSuggestion', () => {
  it('should return "package" as a suggested command if you input "pekage"', () =>
    expect(getCommandSuggestion('pekage', serverless.cli.loadedCommands))
      .to.be.fulfilled.then(suggestedCommand => {
        expect(suggestedCommand).to.be.equal('package');
      })
  );

  it('should return "deploy" as a suggested command if you input "deploi"', () =>
    expect(getCommandSuggestion('deploi', serverless.cli.loadedCommands))
      .to.be.fulfilled.then(suggestedCommand => {
        expect(suggestedCommand).to.be.equal('deploy');
      })
  );

  it('should return "invoke" as a suggested command if you input "lnvoke"', () =>
    expect(getCommandSuggestion('lnvoke', serverless.cli.loadedCommands))
      .to.be.fulfilled.then(suggestedCommand => {
        expect(suggestedCommand).to.be.equal('invoke');
      })
  );
});
