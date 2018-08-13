(ns serverless.functions
  (:require [cljs.nodejs :as nodejs]))

(nodejs/enable-util-print!)
(defonce moment (nodejs/require "moment"))

(defn hello [event ctx cb]
  (println ctx)
  (cb nil (clj->js
            {:statusCode 200
             :headers    {"Content-Type" "text/html"}
             :body       "<h1>Hello, World!</h1>"})))


(defn now [event ctx cb]
  (println ctx)
  (cb nil (clj->js
            {:statusCode 200
             :headers    {"Content-Type" "text/html"}
             :body       (str "<h1>"(.format (moment.) "LLLL")"</h1>")}))) ; call nodejs package

(set! (.-exports js/module) #js
    {:hello hello
     :now now})