package com.serverless;

import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;

public class RequestHandler
  implements com.amazonaws.services.lambda.runtime.RequestHandler<Map<String,Object>, Object> {
  static Map<String, Object> input;

  @Override
  public Object handleRequest(Map<String, Object> stringObjectMap, Context context) {
    input = stringObjectMap;
    System.out.println("Input received:" + input);
    return "RequestHandler invoke Complete.";
  }
}
