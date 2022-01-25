package com.serverless;

import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.io.Serializable;
import java.util.Map;

import com.amazonaws.services.lambda.runtime.Context;
import com.fasterxml.jackson.databind.ObjectMapper;

public class RequestStreamHandler implements com.amazonaws.services.lambda.runtime.RequestStreamHandler {
  static Map<String, Object> input;
  @Override
  public void handleRequest(InputStream inputStream, OutputStream outputStream, Context context) throws IOException {
    ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    input  = objectMapper.readValue(inputStream, Map.class);
    System.out.println("Input received:" + input);
    objectMapper.writeValue(outputStream, new TestPojo("RequestStreamHandler invoke complete."));
  }

  static private class TestPojo implements Serializable {
    private final static long serialVersionUID = 1L;
    private final String message;

    public TestPojo(String message) {
      this.message = message;
    }

    public String getMessage() {
      return message;
    }
  }
}
