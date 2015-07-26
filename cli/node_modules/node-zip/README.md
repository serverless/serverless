node-zip
========

node-zip - Zip/Unzip files ported from JSZip

Installation
------------

	npm install node-zip


Usage
-----

Zip:

	var zip = new require('node-zip')();
	zip.file('test.file', 'hello there');
	var data = zip.generate({base64:false,compression:'DEFLATE'});
	console.log(data); // ugly data


Unzip:

	var zip = new require('node-zip')(data, {base64: false, checkCRC32: true});
	console.log(zip.files['test.file']); // hello there


You can also load directly:

	require('node-zip');
	var zip = new JSZip(data, options)
	...

Write to a file (IMPORTANT: use *binary* encode, thanks to @Acek)

	var fs = require("fs");
	zip.file('test.txt', 'hello there');
	var data = zip.generate({base64:false,compression:'DEFLATE'});
	fs.writeFileSync('test.zip', data, 'binary');

Testing
-------

	npm install -g jasmine-node
	jasmine-node test

Manual
------

node-zip uses JSZip, please refer to their website for further information:
http://stuartk.com/jszip/

Contributors
------------

> David Duponchel [@dduponchel](https://github.com/dduponchel)

Feel free to send your pull requests and contribute to this project

License
-------

MIT