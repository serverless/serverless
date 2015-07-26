JSZip
=====

A library for creating, reading and editing .zip files with Javascript, with a
lovely and simple API.

See http://stuartk.com/jszip for all the documentation.

```javascript
var zip = new JSZip();

zip.file("Hello.txt", "Hello World\n");

var img = zip.folder("images");
img.file("smile.gif", imgData, {base64: true});

var content = zip.generate({type:"blob"});

// see FileSaver.js
saveAs(content, "example.zip");

/*
Results in a zip containing
Hello.txt
images/
    smile.gif
*/
```

Test status
-----------

[![Build Status](https://api.travis-ci.org/Stuk/jszip.svg?branch=master)](http://travis-ci.org/Stuk/jszip)

[![Selenium Test Status](https://saucelabs.com/browser-matrix/jszip.svg)](https://saucelabs.com/u/jszip)

License
-------

JSZip is dual-licensed. You may use it under the MIT license *or* the GPLv3
license. See [LICENSE.markdown](LICENSE.markdown).
