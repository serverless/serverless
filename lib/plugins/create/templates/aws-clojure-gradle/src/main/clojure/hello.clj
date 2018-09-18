(ns hello
  (:require [clojure.data.json :as json])
  (:gen-class
    :methods [^:static [handler [java.util.Map, com.amazonaws.services.lambda.runtime.Context] java.util.Map]]))

(defn -handler [input, context]
  { "statusCode" 200
    "body" (json/write-str {"message" "Go Serverless v1.x! Your function executed successfully!"})
    "headers" {"X-Powered-By" "AWS Lambda & Serverless"}})