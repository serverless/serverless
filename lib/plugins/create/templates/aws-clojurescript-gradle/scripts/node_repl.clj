(require 'cljs.repl)
(require 'cljs.build.api)
(require 'cljs.repl.node)

(cljs.build.api/build "src"
                      {:main 'serverless.functions
                       :output-dir "build/clojurescript/dev/js/out",
                       :install-deps true,
                       :optimizations :none,
                       :target :nodejs,
                       :verbose true
                       :npm-deps {"moment" "2.22.2"}})

(cljs.repl/repl (cljs.repl.node/repl-env)
                :watch "src"
                :output-dir "build/clojurescript/dev/js/out")