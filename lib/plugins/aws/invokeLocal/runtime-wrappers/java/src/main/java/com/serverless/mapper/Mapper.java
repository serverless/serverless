package com.serverless.mapper;

import java.util.HashMap;

public interface Mapper {
  Object read(HashMap<String, Object> event) throws Exception;
}
