package com.serverless.mapper;

public abstract class AbstractMapper implements Mapper {
  protected final Class<?> targetClass;

  public AbstractMapper(Class<?> targetClass) {
    this.targetClass = targetClass;
  }
}
