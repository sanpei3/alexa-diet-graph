// $Id$

// Copyright (C) 2018 Yoshiro MIHIRA
// For license information, see LICENSE.txt

'use strict';

const Alexa = require('alexa-sdk');
const rp = require("request-promise");
const Agent = require('agentkeepalive');
const timeout = 5 * 1000;
const server_error_message = '記録に失敗しました。体重グラフのサーバが不調な可能性があります時間を置いてから試みてください。詳しくは体重グラフのウェブページを参照ください。';

// If you use node.js 8.10 and later, you must to set enviroment variable on lambda console
process.env.TZ = "Asia/Tokyo";

// please define "Environment variables " field at AWS lambda console
const APP_ID = process.env.ALEXA_APP_ID;

function handleRequest(options, timeout) {
    // Add default request options
    Object.assign(options, {
	agentClass: options.uri.startsWith('https') ? Agent.HttpsAgent : Agent,
	agentOptions: Object.assign({}, options.agentOptions, {
	    // Set keep-alive free socket to timeout after 45s of inactivity
	    freeSocketTimeout: 5000
	}),
	headers: Object.assign({}, options.headers, {
	    'Cache-Control': 'no-cache'
	}),
	gzip: true,
	timeout: parseInt(timeout)
    });
    return rp(options);
}

function isNoon(date) {
    var hour = new Date(date).getHours().toString();
    if (hour >= 5 && hour < 15) {
	return true;
    } else {
	return false;
    }
}

function help(t) {
    const helpmsg = [
	"体重グラフスキルを使うと、Webサービス体重グラフに体重を記録することができます。ご利用の際は、「30kg記録してくれる」のように話しかけてください。終了方法は、終了と呼びかけてください。体重をキログラムで答えてください。",
        '小数点一桁目まで対応しています。体重をキログラムで答えてください。',
        '体重をキログラムで答えてください。',
    ];
    var help_num = Number(t.attributes['help_num']);
    if (isNaN(help_num)) {
        help_num = 0;
    }
    if (help_num >= helpmsg.length) {
        help_num = 0;
    }
    const result = helpmsg[help_num];
    t.attributes['help_num'] = help_num + 1;
    t.emit(':ask', result);
}

function updateDiet(weight, accessToken, self) {

    var date = Date.now();
    var year = new Date(date).getFullYear().toString();
    var month = (new Date(date).getMonth() +1).toString();
    var day = new Date(date).getDate().toString();
    var hour = new Date(date).getHours().toString();
    const daysYomi = [
	" いちにち",
	"ふつか",
	"みっか",
	"よっか",
	"いつか",
	"むいか",
	"なのか",
	"ようか",
	"ここのか",
	"とおか",
    ];
    
    
    var options_get_prev_weight = {
        method: 'GET',
        uri: "http://diet.dyndns.org/?cmd=weight_prev&count=20",
	timeout: timeout,
        headers: {
	    'Authorization': "Bearer " + accessToken,
        },
    };

    return rp(options_get_prev_weight).then((response) => {
	var res = JSON.parse(response);

	var date = Date.now();
	var noonFlag = isNoon(date);
	var prevWeight = 0;
	var prevDiff = 0;
	var prevDays = 0;
	var prevHours = 0;
	var oneDay = 60*60*24;
	var diffMessage = "";

	console.log(response);
	if (res.data != undefined) {
	    res.data.some(function(val, index) {
		if (isNoon(val.timestamp*1000) == noonFlag) {
		    prevDiff = val.diff;
		    prevDays = parseInt(prevDiff / oneDay);
		    prevHours = parseInt((prevDiff % oneDay) / 60 / 60);
		    if (!(prevDays == 0 && prevHours == 0) &&
			!(prevDays == 0 && prevHours <= 12)) {
			prevWeight = val.weight;
			return true;
		    }
		}
	    });
	}
	if (
	    ((self.event.request.intent.slots.DotNumber == undefined)
	     || ((self.event.request.intent.slots.DotNumber != undefined) &&
		 (self.event.request.intent.slots.DotNumber.value == undefined)))
	    && (prevWeight != 0)
	    && (prevDays <= 7)) {
	    const yetAnotherWeight = Math.floor(weight / 10) * 10 +
		  (weight - Math.floor(weight / 10) * 10) / 10;
	    if (Math.abs(yetAnotherWeight - prevWeight) < Math.abs(weight - prevWeight)) {
		weight = yetAnotherWeight;
	    }
	}
	console.log("Request weight:" + weight);
	var options = {
            method: 'POST',
	    uri: "https://diet.dyndns.org/",
	    timeout: timeout,
	    form: {
		'year' : year,
		'month' : month,
		'day' : day,
		'hour' : hour,
		'weight' : weight,
		'comment' : "",
		'cmd' : "user",
		'mode' : "input"
	    },
            headers: {
		'Authorization': "Bearer " + accessToken, 
            },
	};
	if (prevWeight != 0) {
	    var diffWeight = Math.round((weight - prevWeight)*10) * 100;
	    if (Math.abs(diffWeight) >= 10*1000) {
		const message = weight +"kgと前回から10kg以上の変化があります、もう一度、体重を教えてください。";
		self.emit(':ask', message);
		return;
	    }
	    if (prevHours > 12) {
		prevHours = 0;
		prevDays = prevDays + 1;
	    }
	    if (prevDays <= 10) {
		var diffMessage = daysYomi[prevDays - 1] +"前から"
	    } else{
		var diffMessage = prevDays + "前から"
	    }
	    if (diffWeight != 0) {
		if (diffWeight > 0) {
		    diffMessage = diffMessage + diffWeight +"g増えました。";
		} else {
		    diffMessage = diffMessage + diffWeight * (-1) +"g減りました。";
		}
	    } else {
		diffMessage = diffMessage + "変化はありませんでした。";
	    }
	}
	rp(options).then((response) => {
	    if (response.match(/<p>ログアウトまたはタイムアウトしました。<\/p>/)) {
		self.attributes['serverError'] = 0;
		self.emit(':tellWithLinkAccountCard','アカウントリンクの有効期限が切れているようです。Alexaアプリを使用してアカウントリンクを再設定してください');
	    } else if (response.match(/登録しました。<br>/)) {
		self.attributes['serverError'] = 0;
		self.emit(':tell', weight + 'kg で記録しました。' + diffMessage);
	    } else {
		self.attributes['serverError'] = 0;
		self.emit(':tell', server_error_message);
	    }
	}, (error) => {
	    var serverError = Number(t.attributes['serverError']);
	    if (isNaN(serverError) || serverError == 0) {
		self.attributes['serverError'] = 1;
		self.emit(':ask', '記録に失敗しました。再度体重を教えてください。');
	    } else {
		self.attributes['serverError'] = 0;
		self.emit(':tell', server_error_message);
	    }
	});
    }, (error) => {
	self.attributes['serverError'] = 0;
	self.emit(':tell', server_error_message);
    });
}

function convertDotNumberStringToDotNumber(s, maxNumberOfDigit) {
    let dotWeight = Number(s);
    if (!isNaN(dotWeight)) {
	for (var i = 1; i <= maxNumberOfDigit; i++) {
	    var p = Math.pow(10, i);
	    if (dotWeight < p) {
		return dotWeight / p;
	    }
	}
	return -1;
    }
    return 0;
}

const handlers = {
    'weight': function () {
        let accessToken = this.event.session.user.accessToken;
        if (accessToken == undefined) {
	    this.emit(':tellWithLinkAccountCard','体重を記録するには、体重グラフのアカウントが必要です。' +
                    'Alexaアプリを使用してAmazonアカウントと体重グラフのアカウントを' +
                    'リンクしてください。');
            return;
        }
	var options = {
	    method: 'GET',
	    uri: "https://diet.dyndns.org/?cmd=oa2_isvalid",
	    timeout: timeout,
	    headers: {
		'Authorization': "Bearer " + accessToken, 
	    },
	};
	rp(options).then((response) => {
	    if (response == '{"isValid":false}') {
		this.attributes['serverError'] = 0;
		this.emit(':tellWithLinkAccountCard','アカウントリンクの有効期限が切れているようです。Alexaアプリを使用してアカウントリンクを再設定してください');
		return;
	    }
	}, (error) => {
	    console.log(error);
	    this.attributes['serverError'] = 0;
	    this.emit(':tell', server_error_message);
	    return;
	});
        if (this.event.request.intent != undefined) {
            const intent = this.event.request.intent;
	    console.log("slots" + JSON.stringify(intent.slots));

            if (intent.slots.FirstWholeNumber != undefined) {
                const FirstWholeNumberString = this.event.request.intent.slots.FirstWholeNumber.value;
                let weight = Number(FirstWholeNumberString);
		console.log("FirstWholeNumber:" + FirstWholeNumberString);

                if (!isNaN(weight)) {
                    if (intent.slots.DotNumber != undefined) {
			if (intent.slots.DotNumber.value != undefined) {
                            const DotNumberString = this.event.request.intent.slots.DotNumber.value;
			    var dotNumber = convertDotNumberStringToDotNumber(DotNumberString, 1);
			    console.log("DotNumber:" + DotNumberString);
			    if (dotNumber == -1) {
				this.emit(':ask', '小数点以下は一桁までの対応です。もう一度、体重を教えてください。');
                            } else {
				weight = weight + dotNumber;
			    }
			}
		    }
		    if (intent.slots.YADotNumber != undefined) {
			if (intent.slots.YADotNumber.value != undefined) {
			    if (intent.slots.YADotNumber.resolutions != undefined) {
				if (intent.slots.YADotNumber.resolutions.resolutionsPerAuthority != undefined) {
				    if (intent.slots.YADotNumber.resolutions.resolutionsPerAuthority[0] != undefined) {
					if (intent.slots.YADotNumber.resolutions.resolutionsPerAuthority[0].status != undefined) {
					    if (intent.slots.YADotNumber.resolutions.resolutionsPerAuthority[0].status.code != undefined) {
						if (intent.slots.YADotNumber.resolutions.resolutionsPerAuthority[0].status.code == "ER_SUCCESS_MATCH" ) {
						    if (intent.slots.YADotNumber.resolutions.resolutionsPerAuthority[0].status.code == "ER_SUCCESS_MATCH" ) {
							const DotNumberString = intent.slots.YADotNumber.resolutions.resolutionsPerAuthority[0].values[0].value.id;
							var dotNumber = convertDotNumberStringToDotNumber(DotNumberString, 1);
							console.log("YADotNumber:" + DotNumberString);
							if (dotNumber == -1) {
							    this.emit(':ask', '小数点以下は一桁までの対応です。もう一度、体重を教えてください。');
							} else {
							    weight = weight + dotNumber;
							}
						    }
						}
					    }
					}
				    }
				}
			    }
			}
                    }
		    if (intent.slots.DotNumber.value == undefined
			&& intent.slots.YADotNumber.value == undefined
			&& weight > 1000 && weight < 9999) {
			weight = Math.floor(weight / 100) +
			    (weight % 10) /10;
		    }
                    if ( 1 <= weight && weight <= 600 ) {
                        updateDiet(weight, accessToken, this);
                        return;
                    } else {
			this.emit(':ask', '600キログラム以下に対応しています。もう一度、体重を教えてください。');
		    }
                }
            }  
        }
        this.emit(':ask', 'すいません、聞き取れませんでした。もう一度、体重を教えてください。');
    },
    'LaunchRequest': function () {
        this.emit(':ask', '体重をキログラムで答えてください。');
    },

    'AMAZON.HelpIntent': function () {
	help(this);
    },
    'AMAZON.CancelIntent': function () {
        this.emit(':tell', 'キャンセルします。');
    },
    'AMAZON.StopIntent': function () {
        this.emit(':tell', '終了します。');
    },
    Unhandled: function() {
        help(this);
    },
};
 
exports.handler = function (event, context) {
    const alexa = Alexa.handler(event, context);
    alexa.appId = APP_ID;
    alexa.registerHandlers(handlers);
    alexa.execute();
};
