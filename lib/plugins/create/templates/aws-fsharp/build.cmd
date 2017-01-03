dotnet restore
dotnet build --configuration Release
dotnet lambda package --configuration Release --framework netcoreapp1.0  --output-package bin/Release/netcoreapp1.0/deploy-package.zip
