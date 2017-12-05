package com.serverless;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.beans.Introspector;
import java.beans.PropertyDescriptor;
import java.io.BufferedReader;
import java.io.File;
import java.io.IOException;
import java.io.InputStreamReader;
import java.lang.reflect.Method;
import java.net.URL;
import java.net.URLClassLoader;
import java.util.HashMap;

public class InvokeBridge {
  private File artifact;
  private String className;
  private Object instance;
  private Class clazz;

  private InvokeBridge() {
    this.artifact = new File(new File("."), System.getProperty("artifactPath"));
    this.className = System.getProperty("className");

    try {
      HashMap<String, Object> parsedInput = parseInput(getInput());
      HashMap<String, Object> eventMap = (HashMap<String, Object>) parsedInput.get("event");

      this.instance = this.getInstance();

      System.out.println(this.invoke(eventMap, this.getContext(parsedInput)).toString());
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

    this.clazz = Class.forName(this.className, true, child);

    return this.clazz.newInstance();
  }

  private Object invoke(HashMap<String, Object> event, Context context) throws Exception {
    Method[] methods = this.clazz.getDeclaredMethods();
    Method method = methods[1];
    Class requestClass = method.getParameterTypes()[0];

    if (requestClass.isAssignableFrom(event.getClass())) {
      return method.invoke(this.instance, event, context);
    } else {
      Object request = requestClass.newInstance();
      PropertyDescriptor[] properties = Introspector.getBeanInfo(requestClass).getPropertyDescriptors();
      for(int i=0; i < properties.length; i++) {
        if (properties[i].getWriteMethod() == null) continue;
        String propertyName = properties[i].getName();
        if (event.containsKey(propertyName)) {
          properties[i].getWriteMethod().invoke(request, event.get(propertyName));
        }
      }
      return method.invoke(this.instance, request, context);
    }
  }

  private HashMap<String, Object> parseInput(String input) throws IOException {
    TypeReference<HashMap<String,Object>> typeRef = new TypeReference<HashMap<String,Object>>() {};
    ObjectMapper mapper = new ObjectMapper();

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
