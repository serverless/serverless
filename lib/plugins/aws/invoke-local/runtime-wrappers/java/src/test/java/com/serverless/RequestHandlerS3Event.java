package com.serverless;

import com.amazonaws.services.lambda.runtime.Context;
import com.amazonaws.services.lambda.runtime.RequestHandler;
import com.amazonaws.services.lambda.runtime.events.S3Event;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;

public class RequestHandlerS3Event implements RequestHandler<S3Event, Object> {
  static S3Event input;

  @Override
  public Object handleRequest(S3Event event, Context context) {
    input = event;
    ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    try {
      System.out.println("Input received:" + objectMapper.writeValueAsString(input));
    } catch (JsonProcessingException e) {
      System.out.println("Input received:" + input.toString());
      throw new RuntimeException("Failed to convert to JSON.", e);
    }
    return "RequestHandlerS3Event invoke Complete.";
  }
}
