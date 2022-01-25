package com.serverless.mapper;

import java.util.HashMap;

public class HashMapWrapper {
  private final HashMap<String, ?> hashMap;

  public HashMapWrapper(HashMap<String, ?> hashMap) {
    this.hashMap = hashMap;
  }

  public String getAsString(String key) {
    return String.class.cast(hashMap.get(key));
  }

  public Long getAsLong(String key) {
    Object o = hashMap.get(key);
    if (o instanceof Integer) {
      return new Long(Integer.class.cast(o).longValue());
    } else {
      return Long.class.cast(o);
    }
  }

  public HashMapWrapper getAsHashMapWrapper(String key) {
    return new HashMapWrapper(HashMap.class.cast(hashMap.get(key)));
  }
}
