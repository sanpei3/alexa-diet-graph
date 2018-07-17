all:
	zip -r -q weight.zip index.js node_modules
	aws s3 --profile s3-upload-lambda cp weight.zip s3://sanpei/alexa-diet-graph/
	echo https://s3-ap-northeast-1.amazonaws.com/sanpei/alexa-diet-graph/weight.zip

install-module:
	npm install request-promise
	npm install request
	npm install alexa-sdk
