<!--
title: Hello World Go Example
menuText: Hello World Go Example
description: Create a Go Hello World Lambda function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically geneated  -->
### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/examples/hello-world/go/)
<!-- DOCS-SITE-LINK:END -->

# Hello World Go Example

Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).

You should also have [go](https://golang.org/doc/install) and [make](https://www.gnu.org/software/make/)

It is always good practice to organise your `go` projects within [GOPATH](https://golang.org/doc/code.html#GOPATH), to maximise the benefits of go tooling.

## 1. Create a service
There are two templates for `go`:

1. [aws-go](https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/aws-go) - `serverless create --template aws-go --path myService`
2. [aws-go-dep](https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/aws-go-dep) - `serverless create --template aws-go-dep --path myService`

where:
- 'aws-go' fetches dependencies using standard `go get`. 
- 'aws-go-dep' uses [go dep](https://github.com/golang/dep) and requires your project to be in `$GOPATH/src`
- 'myService' is a new folder to be created with template service files. 

Change directories into 'myService' folder and you can see this project has 2 handler functions: `hello` and `world` split into 2 separate go packages (folders):

```
.
├── hello/
│   └── main.go
├── world/
│   └── main.go
```

This because a `main()` function is required as entry point for each handler executable.  

## 2. Build using go build to create static binaries

Run `make build` to build both functions. Successful build should generate the following binaries:

```
.
├── bin/
│   |── hello
│   └── world
```

## 3. Deploy
`serverless deploy` or `sls deploy`. `sls` is shorthand for the Serverless CLI command

## 4. Invoke deployed function
Invoking the both functions should return a successful results:

```bash
serverless invoke -f hello
{
    "message": "Go Serverless v1.0! Your function executed successfully!"
}

serverless invoke --f world
{
    "message": "Okay so your other function also executed successfully!"
}
```

Congrats you have just deployed and run your Hello World function!
