#!/bin/bash

cd ~
if [ ! -d "last" ]; then
  echo "Error: last directory does not exist. Please run update_crate_guide.sh first."
  exit 1
fi
cp -r last/crate-guide/ .

echo "\n\n---------------------------------------------------------------------"
echo "The rollback process has successfully completed."
echo "This script is untested. Please check the rollback manually."
echo ".env has been copied from the last version."
cd crate-guide/client/
version=$(jq -r '.version' package.json)
echo "The version of Crate Guide just installed is: v$version \n\n"


