var express = require('express');
var app = express();
var cors = require('cors');
var path = require('path');
var bodyParser = require('body-parser')
var PORT = process.env.PORT || 3000;
var mysql = require('mysql');
var sk = 'YOUR_SECRET_KEY'
var pk = 'YOUR_PUBLIC_KEY';
var stripe = require('stripe')(sk);
var querystring = require('querystring'); 
var nodemailer = require('nodemailer');
var qrcode = require('qrcode');

var transport = nodemailer.createTransport({
  host: "smtp.mailtrap.io",
  port: 2525,
  auth: {
    user: "YOUR_USER",
    pass: "YOUR_PASS"
  }
});

var con = mysql.createConnection({
  host: "YOUR_HOST",
  user: "YOUR_USER",
  password: "YOUR_PASS",
  database: "YOUR_DB",
  debug: false
});
con.connect(function(err) {
    if (err) throw err
    console.log("Connected to DB");
});

app.use(cors());
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())
app.use(express.static('public'))

app.get('/', function(req, res) {
	res.sendFile(path.resolve(__dirname, 'index.html'));
});

app.get('/app', function(req, res) {
	console.log(req.query);
	res.sendFile(path.resolve(__dirname, 'public/app.html'));
});

app.get('/success', function(req, res){
	var q = querystring.stringify({
		"pk": req.query.pk,
		"user": req.query.user
	});
	
	res.redirect("/app?"+q);
});

app.get('/cancel', function(req, res){
	res.sendFile(path.resolve(__dirname, 'public/cancel.html'));
});

app.post('/login', function(req, res) {
	console.log(req.body);
	con.query("SELECT * FROM users WHERE user = '"+req.body.user+"' AND pass='"+req.body.pass+"'", function (err, result) {
	    if (err) throw err;
	    console.log(result[0]!=undefined);
	    if(result[0]!=undefined) {
	    	var q = querystring.stringify({
		    	"pk": pk,
		    	"user": req.body.user
		    });
	   		res.send('/app?'+q);
	    }
	});
});

app.post('/getQR', function(req, res) {
	qrcode.toDataURL(JSON.stringify(req.body), function (err, url) {
	  res.send(url);
	})
});

app.post('/getPK', function(req, res) {
	res.send(pk);
});

app.post('/returnQR', function(req, res) {
	var sql = "SELECT id,url FROM qrs WHERE status != 'cancel' AND user = '"+req.body.user+"'";
	con.query(sql, function (err, result) {
	  if (err) throw err;
	  res.send(result);
	});
});

app.post('/register', function(req, res) {
	console.log(req.body);
	var sql = "INSERT INTO users (user, pass) VALUES ('"+req.body.user+"', '"+req.body.pass+"')";
	con.query(sql, function (err, result) {
	  if (err) throw err;
	  console.log("Se inserto correctamente!");
	});
	res.redirect("/");
});

app.post('/getSession', function(req, res) {
	console.log(req.body);
	var session;
	var url_success;
	(async () => {
		var q = querystring.stringify({
			"pk": req.body.pk,
			"user": req.body.user
		});
		url_success = 'http://localhost:3000/success?'+q;
	  session = await stripe.checkout.sessions.create({
	    payment_method_types: ['card'],
	    line_items: [{
	      name: 'Custom Payment',
	      description: 'Product',
	      amount: req.body.amount,
	      currency: 'mxn',
	      quantity: 1,
	    }],
	    success_url: url_success,
	    cancel_url: 'http://localhost:3000/cancel',
	  });
	  console.log(session);
	  res.send(session.id);
	  var amount = Number(req.body.amount)/100;
	  var email = req.body.email;
	  var user = req.body.user;
	  var subject = 'Thank you for Using Our Cash-Withdraw Services';
	  qrcode.toDataURL(JSON.stringify({amount:amount,email:email,user:user,session_id:session.id}), function (err, url) {
	    if(req.body.fuel != undefined) {
	    	subject = "Thank you! Fuel Type: " + req.body.fuel;
	    }
	    if(req.body.store != undefined) {
	    	subject = "Thank you! E-CART from: " + req.body.store.toString().toUpperCase();
	    }

	    var message = {
	        from: 'management@transpay.com',
	        to: email,
	        subject: subject,
	        html: '<h1>Have the best moments with your family in these difficult times</h1><br><p><li><b>USER: </b>'+user+'</li><li><b>AMOUNT CHARGED: </b>'+amount+'</li><li><b>ID: </b>'+session.id+'</li></p><p>Get yourself a <b>BREAK</b> today, and stay home as much as possible!</p><br><img width="250" src="'+url+'" alt="img" /><br>Sincerely,<br>Management Office.'
	    };
	    transport.sendMail(message, function(err, info) {
	        if (err) {
	          console.log(err)
	        } else {
	          console.log(info);
	          var sql = "INSERT INTO qrs (session_id, user, amount, email, url) VALUES ('"+session.id+"', '"+user+"', '"+amount+"', '"+email+"', '"+url+"')";
	          con.query(sql, function (err, result) {
	            if (err) throw err;
	            console.log("Se inserto correctamente!");
	          });
	        }
	    });
	  })
	})();
	
});

app.listen(PORT, function() {
	console.log('Corriendo servicio en puerto:', PORT);
});