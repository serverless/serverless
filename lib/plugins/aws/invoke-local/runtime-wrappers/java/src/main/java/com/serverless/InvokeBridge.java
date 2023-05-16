package com.serverless;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.HashMap;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.serverless.mapper.Mapper;
import com.serverless.mapper.MapperFactory;

public class InvokeBridge {
  private File artifact;
  private String className;
  private String handlerName;
  private Object instance;
  private Class<?> clazz;

  private InvokeBridge() {
    this.artifact = new File(new File("."), System.getProperty("artifactPath"));
    this.className = System.getProperty("className");
    this.handlerName = System.getProperty("handlerName");

    try {
      HashMap<String, Object> parsedInput = parseInput(getInput());
      HashMap<String, Object> eventMap = (HashMap<String, Object>) parsedInput.get("event");

      this.instance = this.getInstance();

      Object output = this.invoke(eventMap, this.getContext(parsedInput));
      String string = null;
      if(output != null) {
        if(output.getClass().isAssignableFrom(ByteArrayOutputStream.class)){
          string = new String(((ByteArrayOutputStream)output).toByteArray());
        }else {
          string = output.toString();
        }
      }
      System.out.println(string);
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  private Context getContext(HashMap<String, Object> parsedInput) {
    HashMap<String, Object> contextMap = (HashMap<String, Object>) parsedInput.get("context");

    String name = (String) contextMap.getOrDefault("name", "functionName");
    String version = (String) contextMap.getOrDefault("version", "LATEST");
    String logGroupName = (String) contextMap.getOrDefault("logGroupName", "logGroup");
    int timeout = Integer.parseInt(String.valueOf(contextMap.getOrDefault("timeout", 5)));

    return new Context(name, version, logGroupName, timeout);
  }

  private Object getInstance() throws Exception {
    URL[] urls = {this.artifact.toURI().toURL()};
    URLClassLoader child = new URLClassLoader(urls, this.getClass().getClassLoader());
    Thread.currentThread().setContextClassLoader(child);

    this.clazz = Class.forName(this.className, true, child);

    return this.clazz.newInstance();
  }

  private Object invoke(HashMap<String, Object> event, Context context) throws Exception {
    Method method = findHandlerMethod(this.clazz, this.handlerName);
    Class<?> requestClass = method.getParameterTypes()[0];
    Mapper mapper = MapperFactory.getMapper(requestClass);
    Object request = mapper.read(event);

    if (method.getParameterCount() == 1) {
      return method.invoke(this.instance, request);
    } else if (method.getParameterCount() == 2) {
      return method.invoke(this.instance, request, context);
    } else if (method.getParameterCount() == 3 && requestClass.isAssignableFrom(InputStream.class)) {
      ByteArrayOutputStream outputStream = new ByteArrayOutputStream();
      method.invoke(this.instance, request, outputStream, context);
      return outputStream;
    } else {
      throw new NoSuchMethodException("Handler should take 1, 2, or 3 (com.amazonaws.services.lambda.runtime.RequestStreamHandler compatible handlers) arguments: " + method);
    }
  }

  private Method findHandlerMethod(Class<?> clazz, String handlerName) throws Exception {
    Method candidateMethod = null;
    for(Method method: clazz.getMethods()) {
      if (method.getName().equals(handlerName) && !method.isBridge()) {
        // Select the method with the largest number of parameters
        // If two or more methods have the same number of parameters, AWS Lambda selects the method that has
        // the Context as the last parameter.
        // If none or all of these methods have the Context parameter, then the behavior is undefined.
        int paramCount = method.getParameterCount();
        boolean lastParamIsContext = paramCount >= 1 && method.getParameterTypes()[paramCount-1].getName().equals("com.amazonaws.services.lambda.runtime.Context");
        if (candidateMethod == null || paramCount > candidateMethod.getParameterCount() || (paramCount == candidateMethod.getParameterCount() && lastParamIsContext)) {
          candidateMethod = method;
        }
      }
    }

    if (candidateMethod == null) {
      throw new NoSuchMethodException("Could not find handler for " + handlerName + " in " + clazz.getName());
    }

    return candidateMethod;
  }

  private HashMap<String, Object> parseInput(String input) throws IOException {
    TypeReference<HashMap<String,Object>> typeRef = new TypeReference<HashMap<String,Object>>() {};
    ObjectMapper mapper = new ObjectMapper().findAndRegisterModules();

    JsonNode jsonNode = mapper.readTree(input);

    return mapper.convertValue(jsonNode, typeRef);
  }

  private String getInput() throws IOException {
    BufferedReader streamReader = new BufferedReader(new InputStreamReader(System.in, "UTF-8"));
    StringBuilder inputStringBuilder = new StringBuilder();
    String inputStr;

    while ((inputStr = streamReader.readLine()) != null) {
      inputStringBuilder.append(inputStr);
    }
    return inputStringBuilder.toString();
  }

  public static void main(String[] args) {
    new InvokeBridge();
  }
}
