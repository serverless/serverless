'use strict';

const { expect } = require('chai');
const resolveDataPathSize = require('./resolveDataPathSize');

describe('#resolveDataPathSize', () => {
  it('should count root property as 1', () => expect(resolveDataPathSize('.foo'), 1));
  it('should recognize all deep litera properties', () =>
    expect(resolveDataPathSize('.foo.bar.mar'), 3));
  it('should recognize string property', () => expect(resolveDataPathSize(".foo['bar']"), 2));
  it('should recognize multiple string property', () =>
    expect(resolveDataPathSize(".foo['bar']['or']"), 3));
  it('should recognize numeric property', () => expect(resolveDataPathSize('.foo[1]'), 2));
  it('should recognize multiple numeric properties', () =>
    expect(resolveDataPathSize('.foo[1][2]'), 3));
  it('should recognize mixed multiple property notations', () =>
    expect(resolveDataPathSize(".foo[1]['2'].elo['3'].bar[2].foo['2'][3]"), 10));
});
