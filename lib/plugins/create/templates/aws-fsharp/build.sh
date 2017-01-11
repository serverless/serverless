#!/bin/bash

#build handlers
dotnet restore
dotnet publish -c release
dotnet lambda package --configuration release --framework netcoreapp1.0  --output-package bin/release/netcoreapp1.0/deploy-package.zip
