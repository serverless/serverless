'use strict';

const expect = require('chai').expect;
const getCommandSuggestion = require('./getCommandSuggestion');
const Serverless = require('../../lib/Serverless');

const serverless = new Serverless();
serverless.init();

describe('#getCommandSuggestion', () => {
  it('should return "package" as a suggested command if you input "pekage"', () => {
    const suggestedCommand = getCommandSuggestion('pekage', serverless.cli.loadedCommands);
    expect(suggestedCommand).to.be.equal('package');
  });

  it('should return "deploy" as a suggested command if you input "deploi"', () => {
    const suggestedCommand = getCommandSuggestion('deploi', serverless.cli.loadedCommands);
    expect(suggestedCommand).to.be.equal('deploy');
  });

  it('should return "invoke" as a suggested command if you input "lnvoke"', () => {
    const suggestedCommand = getCommandSuggestion('lnvoke', serverless.cli.loadedCommands);
    expect(suggestedCommand).to.be.equal('invoke');
  });
});
