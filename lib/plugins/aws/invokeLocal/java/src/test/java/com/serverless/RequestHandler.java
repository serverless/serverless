package com.serverless;

import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;

public class RequestHandler
  implements com.amazonaws.services.lambda.runtime.RequestHandler<Map<String,Object>, Object> {

  @Override
  public Object handleRequest(Map<String, Object> stringObjectMap, Context context) {
    return "Complete.";
  }
}
