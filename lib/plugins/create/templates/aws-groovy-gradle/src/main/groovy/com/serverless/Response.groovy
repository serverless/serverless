package com.serverless

import groovy.json.JsonOutput
import groovy.transform.CompileStatic
import groovy.transform.builder.Builder

@Builder
@CompileStatic
class Response {
  Object message
  Map<String, Object> input

  String toJson() {
    return JsonOutput.prettyPrint(JsonOutput.toJson(this))
  }
}
