package com.serverless;

import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;

public abstract class AbstractRequestHandler
  implements com.amazonaws.services.lambda.runtime.RequestHandler<Map<String, Object>, Object> {

  abstract Object handleMe();

  @Override
  public Object handleRequest(Map<String, Object> stringObjectMap, Context context) {
    return "Parent Complete.|" + handleMe();
  }
}
