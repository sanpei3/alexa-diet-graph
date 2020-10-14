MODULE=weight
#FUNCTION_NAME=weight
FUNCTION_NAME=weight-alexa-test
all:
	node index.js
	zip -r -q ${MODULE} index.js  node_modules
	aws lambda update-function-code --function-name "${FUNCTION_NAME}" --zip-file fileb://${MODULE}.zip


install-module:
	npm install request-promise
	npm install request
	npm install alexa-sdk
