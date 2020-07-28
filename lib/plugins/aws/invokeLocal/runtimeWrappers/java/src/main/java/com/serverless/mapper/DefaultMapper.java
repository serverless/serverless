package com.serverless.mapper;

import java.beans.Introspector;
import java.beans.PropertyDescriptor;
import java.io.ByteArrayInputStream;
import java.io.InputStream;
import java.util.HashMap;

import com.fasterxml.jackson.databind.ObjectMapper;

public class DefaultMapper extends AbstractMapper {

  public DefaultMapper(Class<?> targetClass) {
    super(targetClass);
  }

  @Override
  public Object read(HashMap<String, Object> event) throws Exception {
    Object request = event;
    if (targetClass.isAssignableFrom(event.getClass())) {
      request = event;
    } else if (targetClass.isAssignableFrom(InputStream.class)) {
      request = new ByteArrayInputStream(new ObjectMapper().writeValueAsBytes(event));
    } else {
      request = targetClass.newInstance();
      PropertyDescriptor[] properties =
          Introspector.getBeanInfo(targetClass).getPropertyDescriptors();
      for (int i = 0; i < properties.length; i++) {
        if (properties[i].getWriteMethod() == null) continue;
        String propertyName = properties[i].getName();
        if (event.containsKey(propertyName)) {
          try {
            properties[i].getWriteMethod().invoke(request, event.get(propertyName));
          } catch (java.lang.IllegalArgumentException e) {
            // for making debug easier
            throw new RuntimeException("Failed to set property '" + propertyName + "'.", e);
          }
        }
      }
    }
    return request;
  }
}
