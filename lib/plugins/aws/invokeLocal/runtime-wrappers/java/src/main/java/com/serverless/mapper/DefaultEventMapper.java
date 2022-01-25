package com.serverless.mapper;

import java.util.HashMap;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.MapperFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.joda.JodaModule;

public class DefaultEventMapper extends AbstractMapper {

  public DefaultEventMapper(Class<?> targetClass) {
    super(targetClass);
  }

  @Override
  public Object read(HashMap<String, Object> event) throws Exception {
    ObjectMapper objectMapper = new ObjectMapper().findAndRegisterModules();
    objectMapper.configure(MapperFeature.ACCEPT_CASE_INSENSITIVE_PROPERTIES, true);
    objectMapper.configure(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES, false);
    objectMapper.registerModule(new JodaModule());
    return objectMapper.convertValue(event, targetClass);
  }
}
