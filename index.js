// $Id$

// Copyright (C) 2018 Yoshiro MIHIRA
// For license information, see LICENSE.txt

'use strict';

const Alexa = require('alexa-sdk');
const rp = require("request-promise");

process.env.TZ = "Asia/Tokyo";

// please define "Environment variables " field at AWS lambda console
const APP_ID = process.env.ALEXA_APP_ID;

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
    
    var options = {
        method: 'POST',
	uri: "https://diet.dyndns.org/",
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
    
    rp(options).then((response) => {
	if (response.match(/<p>ログアウトまたはタイムアウトしました。<\/p>/)) {
	    self.attributes['serverError'] = 0;
	    self.emit(':tellWithLinkAccountCard','アカウントリンクの有効期限が切れているようです。アカウントリンクを再設定してください');
	} else if (response.match(/登録しました。<br>/)) {
	    self.attributes['serverError'] = 0;
	    self.emit(':tell', weight + 'kg で記録しました。');
	} else {
	    self.attributes['serverError'] = 0;
	    self.emit(':tell', '記録に失敗しました。体重グラフのサーバが不調な可能性があります時間を置いてから試みてください');
	}
    }, (error) => {
	var serverError = Number(t.attributes['serverError']);
	if (isNaN(serverError) || serverError == 0) {
	    self.attributes['serverError'] = 1;
	    self.emit(':ask', '記録に失敗しました。再度体重を教えてください。');
	} else {
	    self.attributes['serverError'] = 0;
	    self.emit(':tell', '記録に失敗しました。体重グラフのサーバが不調な可能性があります時間を置いてから試みてください');
	}
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
	    this.emit(':tellWithLinkAccountCard','スキルを利用するために体重グラフでのアカウントリンク設定をしてください');
            return;
        }
	var options = {
	    method: 'GET',
	    uri: "https://diet.dyndns.org/?cmd=oa2_isvalid",
	    headers: {
		'Authorization': "Bearer " + accessToken, 
	    },
	};
	rp(options).then((response) => {
	    if (response == '{"isValid":false}') {
		this.attributes['serverError'] = 0;
		this.emit(':tellWithLinkAccountCard','アカウントリンクの有効期限が切れているようです。アカウントリンクを再設定してください');
		return;
	    }
	}, (error) => {
	    this.attributes['serverError'] = 0;
	    this.emit(':tell',  '体重グラフのサーバが不調な可能性があります時間を置いてから試みてください');
	    return;
	});
        if (this.event.request.intent != undefined) {
            const intent = this.event.request.intent;
            if (intent.slots.FirstWholeNumber != undefined) {
                const FirstWholeNumberString = this.event.request.intent.slots.FirstWholeNumber.value;
                let weight = Number(FirstWholeNumberString);

                if (!isNaN(weight)) {
                    if (intent.slots.DotNumber != undefined) {
                        const DotNumberString = this.event.request.intent.slots.DotNumber.value;
			var dotNumber = convertDotNumberStringToDotNumber(DotNumberString, 1);
			if (dotNumber == -1) {
			    this.emit(':ask', '小数点以下は一桁までの対応です。もう一度、体重を教えてください。');
                        } else {
			    weight = weight + dotNumber;
			}
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
