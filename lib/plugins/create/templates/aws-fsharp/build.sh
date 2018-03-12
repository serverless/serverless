#!/bin/bash

isMacOs=`uname -a | grep Darwin`

#install zip
if [ -z "$isMacOs" ]
then
  apt-get -qq update
  apt-get -qq -y install zip
fi

dotnet restore

#create deployment package
dotnet lambda package --configuration release --framework netcoreapp2.0 --output-package bin/release/netcoreapp2.0/deploy-package.zip
