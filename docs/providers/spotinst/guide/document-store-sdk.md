<!--
title: Serverless Framework - Spotinst Functions Guide - Document Store SDK
menuText: Document Store SDK
menuOrder: 7
description: How to use the Document Store SDK feature
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/spotinst/guide/document-store-sdk)
<!-- DOCS-SITE-LINK:END -->

# Spotinst Functions - Document Store SDK

We have encapsulated the Document Store API calls for retrieving your documents so you will not have to make an API call within the given function. This will allow for you as the user to access your documents using thegetDoc/get_doc method located in the context variable. Additionally this will also eliminate the need for authentication within the function for accessing your documents. 

## Node
```basg
module.exports.main = (event, context, callback) => {
  context.getDoc("myKey", function(err, res) {
    if(res) {
      console.log('res: ' + res); //myValue
      var body = {
        res: res
      };
      
      callback(null, {
        statusCode: 200,
        body:       JSON.stringify(body),
        headers:    {"Content-Type": "application/json"}
      });
    }
  });
}
```

## Python
```bash
def main(event, context):
    print ('context: %s' % context)

    doc = context.get_doc('myKey')
    print(doc)  #myValue

    res = {
        'statusCode': 200,
        'body': 'res: %s' % doc,
        'headers': {"Content-Type": "application/json"}
    }
    return res
```

## Java 8
```bash
public class Java8Template implements RequestHandler {
    @Override
    public Response handleRequest(Request request, Context context) {
        String value = context.getDoc("myKey");
        System.out.println(value); //myValue

        Response response = new Response(200, String.format("value: %s", value));

        Map<String, String> headers = new HashMap<>();
        headers.put("Content-Type", "application/json");

        response.setHeaders(headers);

        return response;
    }
}
```

