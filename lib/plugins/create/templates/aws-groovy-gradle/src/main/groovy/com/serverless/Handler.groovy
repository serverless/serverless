package com.serverless

import com.amazonaws.services.lambda.runtime.Context
import com.amazonaws.services.lambda.runtime.RequestHandler
import groovy.transform.CompileStatic
import org.apache.log4j.Logger

@CompileStatic
class Handler implements RequestHandler<Map<String, Object>, ApiGatewayResponse> {

  private static final Logger LOG = Logger.getLogger(Handler.class)

  @Override
  ApiGatewayResponse handleRequest(Map<String, Object> input, Context context) {
    LOG.info("received: " + input)
    Response responseBody = Response.builder()
        .message('Go Serverless v1.x! Your function executed successfully!')
        .input(input)
        .build()
    return ApiGatewayResponse.builder()
        .statusCode(200)
        .body(responseBody.toJson())
        .headers(['X-Powered-By': 'AWS Lambda & serverless'])
        .build()
  }
}
