dotnet restore
dotnet tool install -g Amazon.Lambda.Tools --framework netcoreapp3.1

dotnet lambda package --configuration Release --framework netcoreapp3.1 --output-package bin/Release/netcoreapp3.1/deploy-package.zip