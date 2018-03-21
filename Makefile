all:
	zip -r -q weight.zip index.js node_modules

install-module:
	npm install request-promise
	npm install request
	npm install alexa-sdk
