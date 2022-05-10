<!--
title: Serverless Framework - Kubeless Guide - Debugging
menuText: Debugging
menuOrder: 8
description: Recommendations and best practices for debugging Kubeless Functions with the Serverless Framework
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/kubeless/guide/debugging)

<!-- DOCS-SITE-LINK:END -->

# Kubeless - Debugging

How can we debug errors in our Kubeless functions?

Let's imagine that we have deployed the following Python code as a Kubeless function using Serverless:

```python
import urllib2
import json

def find(event, context):
    term = event['data']['term']
    url = "https://feeds.capitalbikeshare.com/stations/stations.json"
    response = urllib2.urlopen(url)
    stations = json.loads(response.read())

    hits = []

    for station in stations["stationBeanList"]:
        if station["stAddress1"].find(term) > -1:
            hits.append(station)

    return json.dumps(hits)
```

And its corresponding Serverless YAML file:

```yml
# serverless.yml
service: bikesearch
provider:
  name: kubeless
  runtime: python2.7

plugins:
  - serverless-kubeless

functions:
  bikesearch:
    handler: handler.find
```

Let's invoke correctly that function

```
serverless invoke --function bikesearch --data '{"term":"Albemarle"}' -l

# Output
Serverless: Calling function: bikesearch...
--------------------------------------------------------------------
[ { availableDocks: 6,
    totalDocks: 15,
    city: '',
    altitude: '',
    stAddress2: '',
    longitude: -77.079382,
    lastCommunicationTime: '2017-08-25 04:46:09 AM',
    postalCode: '',
    statusValue: 'In Service',
    testStation: false,
    stAddress1: 'Tenleytown / Wisconsin Ave & Albemarle St NW',
    stationName: 'Tenleytown / Wisconsin Ave & Albemarle St NW',
    landMark: '',
    latitude: 38.947607,
    statusKey: 1,
    availableBikes: 9,
    id: 80,
    location: '' } ]
```

What happens when something goes wrong? The function currently has no error handling, so that's easy enough to test. Let's invoke the function again with a typo (use _trm_ as the name of the input parameter instead of _term_):

```
serverless invoke --function bikesearch --data '{"trm":"Albemarle"}' -l

# Output
Serverless: Calling function: bikesearch...

  Serverless Error ---------------------------------------

  Internal Server Error

  Get Support --------------------------------------------
     Docs:          docs.serverless.com
     Bugs:          github.com/serverless/serverless/issues
     Forums:        forum.serverless.com

  Your Environment Information -----------------------------
     OS:                     darwin
     Node Version:           8.3.0
     Serverless Version:     1.20.2
```

Serverless returned an error message with a 500 server code, which is what you would expect from a web framework. However, it would be useful to see Python stack trace to better debug the source of the error. This can be done using the `logs` feature in `serverless`:

```
serverless logs -f bikesearch

# Output
Bottle v0.12.13 server starting up (using CherryPyServer())...
Listening on http://0.0.0.0:8080/
Hit Ctrl-C to quit.

172.17.0.1 - - [25/Aug/2017:08:45:20 +0000] "GET /healthz HTTP/1.1" 200 2 "" "Go-http-client/1.1" 0/171
172.17.0.1 - - [25/Aug/2017:08:45:34 +0000] "GET /healthz HTTP/1.1" 200 2 "" "Go-http-client/1.1" 0/72
172.17.0.1 - - [25/Aug/2017:08:46:04 +0000] "GET /healthz HTTP/1.1" 200 2 "" "Go-http-client/1.1" 0/82
172.17.0.1 - - [25/Aug/2017:08:46:07 +0000] "POST / HTTP/1.1" 200 459 "" "" 1/957186
Traceback (most recent call last):
  File "/usr/local/lib/python2.7/site-packages/bottle.py", line 862, in _handle
    return route.call(**args)
  File "/usr/local/lib/python2.7/site-packages/bottle.py", line 1740, in wrapper
    rv = callback(*a, **ka)
  File "/kubeless.py", line 35, in handler
    return func(bottle.request)
  File "/kubeless/handler.py", line 5, in find
    term = event['data']['term']
KeyError: 'term'
172.17.0.1 - - [25/Aug/2017:08:46:16 +0000] "POST / HTTP/1.1" 500 746 "" "" 0/6703
172.17.0.1 - - [25/Aug/2017:08:46:34 +0000] "GET /healthz HTTP/1.1" 200 2 "" "Go-http-client/1.1" 0/122
172.17.0.1 - - [25/Aug/2017:08:46:46 +0000] "POST / HTTP/1.1" 200 459 "" "" 0/892144
172.17.0.1 - - [25/Aug/2017:08:47:04 +0000] "GET /healthz HTTP/1.1" 200 2 "" "Go-http-client/1.1" 0/75
172.17.0.1 - - [25/Aug/2017:08:47:34 +0000] "GET /healthz HTTP/1.1" 200 2 "" "Go-http-client/1.1" 0/102
172.17.0.1 - - [25/Aug/2017:08:48:04 +0000] "GET /healthz HTTP/1.1" 200 2 "" "Go-http-client/1.1" 0/113
172.17.0.1 - - [25/Aug/2017:08:48:34 +0000] "GET /healthz HTTP/1.1" 200 2 "" "Go-http-client/1.1" 0/69
172.17.0.1 - - [25/Aug/2017:08:49:04 +0000] "GET /healthz HTTP/1.1" 200 2 "" "Go-http-client/1.1" 0/98
172.17.0.1 - - [25/Aug/2017:08:49:23 +0000] "POST / HTTP/1.1" 500 746 "" "" 0/655
Traceback (most recent call last):
  File "/usr/local/lib/python2.7/site-packages/bottle.py", line 862, in _handle
    return route.call(**args)
  File "/usr/local/lib/python2.7/site-packages/bottle.py", line 1740, in wrapper
    rv = callback(*a, **ka)
  File "/kubeless.py", line 35, in handler
    return func(bottle.request)
  File "/kubeless/handler.py", line 5, in find
    term = event['data']['term']
KeyError: 'term'
```

It should be clear from the second-to-last line that the error originates in an incorrect key name.

This is a very basic example of debugging a Kubeless function, but it should hopefully highlight the basic principles. Obviously, in production environments, you would want to have more formal and sophisticated error handling built into your code.
