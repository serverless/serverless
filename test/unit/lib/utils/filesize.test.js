'use strict';

const { expect } = require('chai');
const filesize = require('../../../../lib/utils/filesize');

describe('test/unit/lib/utils/filesize.test.js', () => {
  it('should display sizes below 1kb literally', () => {
    expect(filesize(1)).to.equal('1 B');
    expect(filesize(10)).to.equal('10 B');
    expect(filesize(12)).to.equal('12 B');
    expect(filesize(100)).to.equal('100 B');
    expect(filesize(123)).to.equal('123 B');
    expect(filesize(987)).to.equal('987 B');
  });

  it('expect to display round values without decimals', () => {
    expect(filesize(1000)).to.equal('1 kB');
    expect(filesize(3000)).to.equal('3 kB');
    expect(filesize(1000 * 1000)).to.equal('1 MB');
    expect(filesize(4000 * 1000)).to.equal('4 MB');
    expect(filesize(1000 * 1000 * 1000)).to.equal('1 GB');
    expect(filesize(4000 * 1000 * 1000)).to.equal('4 GB');
  });

  it('expect to display not round values below 9 with decimals', () => {
    expect(filesize(1123)).to.equal('1.1 kB');
    expect(filesize(8123)).to.equal('8.1 kB');
    expect(filesize(1234848)).to.equal('1.2 MB');
    expect(filesize(8123494)).to.equal('8.1 MB');
    expect(filesize(1123484848)).to.equal('1.1 GB');
    expect(filesize(8123494934)).to.equal('8.1 GB');
  });

  it('expect to display not round values above 9 without decimals', () => {
    expect(filesize(12123)).to.equal('12 kB');
    expect(filesize(9123)).to.equal('9 kB');
    expect(filesize(12234848)).to.equal('12 MB');
    expect(filesize(9234949)).to.equal('9 MB');
    expect(filesize(12348484848)).to.equal('12 GB');
    expect(filesize(9349493432)).to.equal('9 GB');
  });
});
