package com.serverless

import groovy.transform.CompileStatic
import groovy.transform.builder.Builder

@Builder
@CompileStatic
class ApiGatewayResponse {
  int statusCode
  String body
  Map<String, String> headers
}
