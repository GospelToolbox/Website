var express = require('express');
var exphbs  = require('express-handlebars');
var bodyParser = require('body-parser');
var nameParser = require('humanname');
var validator = require('validator');
var MailChimpAPI = require('mailchimp').MailChimpAPI;
var mailgunApi = require('mailgun-js');


var config = require('./config');

var app = express();

app.engine('handlebars', exphbs());
app.set('view engine', 'handlebars');
app.set('views', './views');

app.use(express.static('public'));
app.enable('trust proxy');

app.use(bodyParser.json());
app.use(bodyParser.urlencoded());

app.get('/', function (req, res) {
  res.render('index', {
  	args: req.query	
  });
});

function contactError(res, msg, result) {
	var url = "/?err=" + msg;

	if(result.fullName) {
		url = url + '&name=' + result.fullName;
	}

	if(result.email) {
		url = url + '&email=' + result.email;
	}

	if(result.message) {
		url = url + '&message=' + result.message;
	}

	if(result.contributing) {
		url = url + '&contributing';
	}

	if(result.ministryApps) {
		url = url + '&ministryApps';
	}

	if(result.personalApps) {
		url = url + '&personalApp';
	}

	url = url + "#contactus";

	res.redirect(url);
}

function contactSuccess(res) {
	res.redirect('/thankyou');
}

function subscribeMailingList(result, callback) {
    var api = new MailChimpAPI(config.mailchimpApiKey, { version : '2.0' });

    var interests = [];

    if(result.contributing) {
    	interests.push('Contributing');
    }

    if(result.ministryApps) {
    	interests.push('MinistryApps');
    }

    if(result.personalApps) {
    	interests.push('PersonalApps');
    }

    api.call('lists', 'subscribe', {
    	id: config.mailchimpListId,
    	email: {
    		email: result.email
    	},
    	merge_vars: {
    		FNAME: result.firstName,
    		LNAME: result.lastName,
    		groupings: [{
    			name: 'Interests',
    			groups: interests
    		}]
    	},
    	update_existing: true
    }, callback );
}

function sendMessage(result, callback) {
	var mailgun = new mailgunApi({apiKey: config.mailgunApiKey, domain: config.mailgunDomain});

	var data = {
	  from: 'Gospel Toolbox Contact Form <contact@gospeltoolbox.org>',
	  to: config.messageDestinationEmail,
	  subject: 'Gospel Toolbox Contact Submission',
	  text: JSON.stringify(result, null, 4)
	};

	mailgun.messages().send(data, callback);
}

function extractResult(req) {
	var result = {};

	result.email = req.body.inputEmail;
	
	result.fullName = req.body.inputName;

	var parsedName = nameParser.parse(result.fullName);
	result.firstName = parsedName.firstName;
	result.lastName = parsedName.lastName;


	if(typeof(req.body.inputSubscriptions) !== 'undefined') {
		result.contributing = req.body.inputSubscriptions.indexOf('contributing') > -1;
		result.ministryApps = req.body.inputSubscriptions.indexOf('ministryApps') > -1;
		result.personalApps = req.body.inputSubscriptions.indexOf('personalApps') > -1;
	} else {
		result.contributing = false;
		result.ministryApps = false;
		result.personalApps = false;
	}

	result.message = req.body.inputMessage;

	return result;
}

app.post('/contact', function(req, res) {

	var result = extractResult(req);

	if(!validator.isEmail(result.email)) {
		return contactError(res, "Please enter an email address.", result);
	}

	if(!validator.isLength(result.firstName, 1)) {
		return contactError(res, "Please enter a first name or nickname you would like us to use.", result)
	}
	
	try {
		subscribeMailingList(result, function(err, data) {
			if(err) {
				console.log(err);
				return contactError(res, config.errorMessage, result);
			}

			try {
				sendMessage(result, function(err, data) {
					if(err) {
						console.log(err);
						return contactError(res, config.errorMessage, result);
					}
					return contactSuccess(res);
				});
			} catch (ex) {
				console.log(ex);
				return contactError(res, config.errorMessage, result)
			}
		});
	} catch (ex) {
		console.log(ex);
		return contactError(res, config.errorMessage, result);
	}
});

app.get('/thankyou', function(req, res) {
	res.render('thankyou');
});


var server = app.listen(80, function () {

  var host = server.address().address;
  var port = server.address().port;

  console.log('Gospel Toolbox website listening at http://%s:%s', host, port);

});