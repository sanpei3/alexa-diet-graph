Alexa 用の「体重グラフ」skillのソースです。

index.js : AWS lambdaのソース
Makefile:  AWS lambdaにuploadするzipを作成するMakefile

dialog.json: Dialog builderのJSON形式

convertDotNumberStringToDotNumber で小数点以下の数字も扱えるようにしました。(第二パラメータで最大桁数を設定します)
