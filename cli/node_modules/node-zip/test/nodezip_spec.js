describe('nodezip', function() {
  beforeEach(function() {
    this.nodezip = require('..')();
  });
  
  describe('when initialized', function() {
    it('should load JSZip in this.nodezip', function() {
      expect(this.nodezip.options).not.toBeNull();
    });

    it('should declare JSZip', function() {
      expect(JSZip).not.toBeNull();
    });
  });

  describe('when archiving a dummy file', function() {
    beforeEach(function() {
      this.fs = require("fs");
      this.dummyFile = this.nodezip.file('test.file', 'hello there');
      this.dummyFileData = this.dummyFile.generate({base64:false,compression:'DEFLATE'});
    });
    
    it('should contain valid data', function() {
      expect(this.dummyFileData).not.toBeNull();
      expect(this.dummyFileData).toMatch(/^PK/);
      expect(this.dummyFileData).toMatch(/test.file/);
    });

    it('should be able to write file', function() {
      this.fs.writeFileSync('test.zip', this.dummyFileData, 'binary');
      expect(this.fs.lstatSync('test.zip')).not.toBeNull()
    });

    it('should be able to deflate file', function() {
      this.dummyFileData = this.fs.readFileSync('test.zip', 'binary');
      this.dummyFile = new JSZip(this.dummyFileData, {base64: false, checkCRC32: true});
      expect(this.dummyFile.files['test.file'].asText()).toEqual("hello there");
      this.fs.unlink('test.zip');
    });
  });
});