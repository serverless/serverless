# base64-url

Base64 encode, decode, escape and unescape for URL applications.

<a href="https://nodei.co/npm/base64-url/"><img src="https://nodei.co/npm/base64-url.png?downloads=true"></a>

[![Build Status](https://travis-ci.org/joaquimserafim/base64-url.png?branch=master)](https://travis-ci.org/joaquimserafim/base64-url)


## API
    
	> base64url.encode('Node.js is awesome.');
	Tm9kZS5qcyBpcyBhd2Vzb21lLg

	> base64url.decode('Tm9kZS5qcyBpcyBhd2Vzb21lLg');
	Node.js is awesome.
 
	> base64url.escape('This+is/goingto+escape==');
	This-is_goingto-escape
  	
    > base64url.unescape('This-is_goingto-escape');
    This+is/goingto+escape==
  	

## Development

**this projet has been set up with a precommit that forces you to follow a code style, no jshint issues and 100% of code coverage before commit**


to run test
``` js
npm test
```

to run jshint
``` js
npm run jshint
```

to run code style
``` js
npm run code-style
```

to check code coverage
``` js
npm run check-coverage
```

to open the code coverage report
``` js
npm run open-coverage
```
