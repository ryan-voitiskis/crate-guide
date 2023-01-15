#!/bin/bash

cd ~
rm -rf new
rm -rf crate-guide
rm -rf last
mkdir crate-guide
mkdir new
cd new/
git clone https://github.com/ryan-voitiskis/crate-guide.git || { echo "Error: git clone failed" ; exit 1; }
cd crate-guide/client/
trap 'echo "Error: client npm i failed"; exit 1' ERR
npm i & wait
trap - ERR
npm run build & wait

cd ../server/
trap 'echo "Error: server npm i failed"; exit 1' ERR
npm i & wait
trap - ERR
cd ~
cp crate-guide/server/.env new/crate-guide/server/.env
cd new/crate-guide/server/
npm run build & wait

cd ~
if [ ! -d "last" ]; then
  mkdir last
fi
cp -r crate-guide/ last/crate-guide/
cp -r new/crate-guide/ crate-guide/
rm -rf new/

echo -e "\n\n---------------------------------------------------------------------"
echo "The install process has been successfully completed."
echo "This script is untested. Please check the installation manually."
echo ".env file must be manually added to the server."
cd crate-guide/client/
version=$(jq -r '.version' package.json)
echo -e "The version of Crate Guide just installed is: v$version \n\n"


