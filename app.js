var express = require('express');
var exphbs = require('express-handlebars');
var bodyParser = require('body-parser');
var nameParser = require('humanname');
var validator = require('validator');
var MailChimpAPI = require('mailchimp').MailChimpAPI;
var mailgunApi = require('mailgun-js');
var Q = require('q');
var _ = require('underscore');
var request = require('request');


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

app.post('/contact', function (req, res) {

  var params = {
    req: req,
    res: res
  };

  validateCaptcha(params)
    .then(extractResult)
    .then(validateInput)
    .then(subscribeToMailingList)
    .then(sendWelcomeMessage)
    .then(contactSuccess)
    .catch(contactError);

});

app.get('/thankyou', function (req, res) {
  res.render('thankyou');
});


var server = app.listen(80, function () {

  var host = server.address().address;
  var port = server.address().port;

  console.log('Gospel Toolbox website listening at http://%s:%s', host, port);

});

function validateCaptcha(params) {
  var deferred = Q.defer();

  var ip = params.req.headers['x-forwarded-for'] || params.req.connection.remoteAddress;
  var response = params.req.body['g-recaptcha-response'];

  var recaptchaData = {
    remoteip: ip,
    response: response,
    secret: config.recaptchaSecret
  };

  request.post(
    'https://www.google.com/recaptcha/api/siteverify',
    { form: recaptchaData },
    function (error, response, body) {
      
      if (error || response.statusCode != 200) {
        deferred.reject({
          res: params.res,
          reason: "Could not validate captcha.",
          result: null
        });
      }
      
      var data = JSON.parse(body);
      if(data.success) {
        deferred.resolve(params);
      } else {
        deferred.reject({
          res: params.res,
          reason: "Could not validate captcha.",
          result: null
        });
      }   
    });
    
  return deferred.promise;
}

function extractResult(params) {
  var result = {};
  var req = params.req;

  result.email = req.body.inputEmail;

  result.fullName = req.body.inputName;

  var parsedName = nameParser.parse(result.fullName);
  result.firstName = parsedName.firstName;
  result.lastName = parsedName.lastName;

  if (typeof (req.body.inputSubscriptions) !== 'undefined') {
    result.contributing = req.body.inputSubscriptions.indexOf('contributing') > -1;
    result.ministryApps = req.body.inputSubscriptions.indexOf('ministryApps') > -1;
    result.personalApps = req.body.inputSubscriptions.indexOf('personalApps') > -1;
  } else {
    result.contributing = false;
    result.ministryApps = false;
    result.personalApps = false;
  }

  result.message = req.body.inputMessage;

  return Q.fcall(function () { return _.extend(params, { result: result }); });
}

function validateInput(params) {
  var result = params.result;

  if (!validator.isEmail(result.email)) {
    return Q.reject({
      res: params.res,
      reason: "Please enter an email address.",
      result: result
    });
  }

  if (!validator.isLength(result.firstName, 1)) {
    return Q.reject({
      res: params.res,
      reason: "Please enter a first name or nickname you would like us to use.",
      result: result
    });
  }

  return Q.fcall(function () { return params; });
}

function subscribeToMailingList(params) {
  var deferred = Q.defer();

  subscribeMailingList(params.result, function (err, data) {
    if (err) {
      deferred.reject({
        res: params.res,
        reason: config.errorMessage,
        result: params.result
      });
    } else {
      deferred.resolve(params);
    }
  });

  return deferred.promise;
}

function sendWelcomeMessage(params) {
  var deferred = Q.defer();
  sendMessage(params.result, function (err, data) {
    if (err) {
      deferred.reject({
        res: params.res,
        reason: config.errorMessage,
        result: params.result
      });
    } else {
      deferred.resolve(params);
    }
  });

  return deferred.promise;
}

function contactError(error) {
  var msg = error.reason;
  var result = error.result;

  var url = "/?err=" + msg;

  if (result && result.fullName) {
    url = url + '&name=' + result.fullName;
  }

  if (result && result.email) {
    url = url + '&email=' + result.email;
  }

  if (result && result.message) {
    url = url + '&message=' + result.message;
  }

  if (result && result.contributing) {
    url = url + '&contributing';
  }

  if (result && result.ministryApps) {
    url = url + '&ministryApps';
  }

  if (result && result.personalApps) {
    url = url + '&personalApp';
  }

  url = url + "#contactus";

  error.res.redirect(url);
}

function contactSuccess(params) {
  params.res.redirect('/thankyou');
}

function subscribeMailingList(result, callback) {
  var api = new MailChimpAPI(config.mailchimpApiKey, { version: '2.0' });

  var interests = [];

  if (result.contributing) {
    interests.push('Contributing');
  }

  if (result.ministryApps) {
    interests.push('MinistryApps');
  }

  if (result.personalApps) {
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
  }, callback);
}

function sendMessage(result, callback) {
  var mailgun = new mailgunApi({ apiKey: config.mailgunApiKey, domain: config.mailgunDomain });

  var data = {
    from: 'Gospel Toolbox Contact Form <contact@gospeltoolbox.org>',
    to: config.messageDestinationEmail,
    subject: 'Gospel Toolbox Contact Submission',
    text: JSON.stringify(result, null, 4)
  };

  mailgun.messages().send(data, callback);
}