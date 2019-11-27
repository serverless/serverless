<!--
title: Hello World Go Example
menuText: Go
description: Create a Go Hello World Lambda function
layout: Doc
-->

<!-- DOCS-SITE-LINK:START automatically generated  -->

### [Read this on the main serverless docs site](https://www.serverless.com/framework/docs/providers/aws/examples/hello-world/go/)

<!-- DOCS-SITE-LINK:END -->

# Hello World Go Example

Make sure `serverless` is installed. [See installation guide](../../../guide/installation.md).

Once installed the Serverless CLI can be called with `serverless` or the shorthand `sls` command.

```
$ sls

Commands
* You can run commands with "serverless" or the shortcut "sls"
* Pass "--verbose" to this command to get in-depth plugin info
* Pass "--no-color" to disable CLI colors
* Pass "--help" after any <command> for contextual help
```

You should also have [go](https://golang.org/doc/install) and [make](https://www.gnu.org/software/make/)

It is always good practice to organize your `go` projects within [GOPATH](https://golang.org/doc/code.html#GOPATH), to maximize the benefits of go tooling.

## 1. Create a service

The Serverless Framework includes starter templates for various languages and providers. There are two templates for `go`.

#### [aws-go](https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/aws-go)

`aws-go` fetches dependencies using standard `go get`.

```
sls create --template aws-go --path myService
```

#### [aws-go-dep](https://github.com/serverless/serverless/tree/master/lib/plugins/create/templates/aws-go-dep)

`aws-go-dep` uses [go dep](https://github.com/golang/dep) and requires your project to be in `$GOPATH/src`

```
sls create --template aws-go-dep --path myService
```

Using the `create` command we can specify one of the available [templates](https://serverless.com/framework/docs/providers/aws/cli-reference/create#available-templates). For this example use aws-go-dep with the `--template` or shorthand `-t` flag.

The `--path` or shorthand `-p` is the location to be created with the template service files.

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

```
sls deploy
```

This will deploy your function to AWS Lambda based on the settings in `serverless.yml`.

## 4. Invoke deployed function

```
sls invoke -f hello
```

```
sls invoke -f world
```

Invoke either deployed function with command `invoke` and `--function` or shorthand `-f`.

In your terminal window you should see the response from AWS Lambda.

```bash
serverless invoke -f hello

{
    "message": "Go Serverless v1.0! Your function executed successfully!"
}

serverless invoke -f world

{
    "message": "Okay so your other function also executed successfully!"
}
```

Congrats you have deployed and ran your Hello World function!
