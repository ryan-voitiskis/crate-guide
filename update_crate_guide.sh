#!/bin/bash

cd ~
rm -rf new
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
if [ -d "last" ]; then
  rm -rf last
fi
mkdir last
cp -r crate-guide/ last/
cp -r new/crate-guide/ .
rm -rf new/

echo -e "\n\n---------------------------------------------------------------------"
echo "The update process has been successfully completed."
echo ".env has been copied from the last version."
cd crate-guide/client/
version=$(jq -r '.version' package.json)
echo -e "The version of Crate Guide just installed is: v$version \n\n"


