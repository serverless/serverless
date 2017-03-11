package com.serverless

import groovy.transform.CompileStatic
import groovy.transform.builder.Builder

@Builder
@CompileStatic
class Response {
  Object message
  Map<String, Object> input
}
