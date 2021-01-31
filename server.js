const http = require('http')
const express = require('express')
const session = require('express-session')
const bcrypt = require('bcrypt')
const fs = require('fs')
const ini = require('ini')
const misc = require('./misc')
const { Cookie } = require('express-session')

const app = express()
const parsedIni = ini.parse(fs.readFileSync('./app.ini', 'utf-8'))
const INI = parsedIni.backend
const INI_DEV = parsedIni.dev
const LOGIN_EXCLUDED_URLS = ['/hash', '/']

/*---------MIDDLEWARE---------*/

app.use(express.json())
app.use(express.urlencoded({ extended: true }))

/**********SESSION INIT*********/
app.use(session({
	secret: INI.sessionSecret,
	resave: false,
	saveUninitialized: true,
	cookie: { sameSite: true }
}))

app.use((req, res, next) => {
	console.log('Request from:', req.get('origin'), 'to', req.originalUrl);

	/*res.setHeader('Access-Control-Allow-Origin', req.get('origin')??'*')
	res.setHeader('Access-Control-Allow-Headers', 'content-type')
	res.setHeader('Access-Control-Allow-Credentials', 'true')*/

	//Skipping login
	if(INI_DEV.developing) {
		req.session.username = INI_DEV.username
		req.session.role = INI_DEV.role
		req.session.prefs = INI_DEV.prefs
	}

	//Login check
	if (req.session.username || LOGIN_EXCLUDED_URLS.includes(req.originalUrl.split('?')[0])) {
		res.setHeader('Content-Type', 'application/json')
		next()
	} else
		res.status(403).send({ message: 'Login required' })
});

/*---------END MIDDLEWARE---------*/

/*---------ROUTES---------*/

/***********PASSWORD HASH***********/
app.get('/hash', (req, res) => {
	res.setHeader('Content-Type', 'text/plain')
	let password = req.query.p
	res.write(password ? misc.hash(password) : 'Utilizzo: http://<server>/hash?p=<password>')
	res.end()
})

/*---------END ROUTES---------*/

/*---------API---------*/

/***********LOGIN**********/
app.post('/', function (req, res) {
	let username = req.body.username
	let password = req.body.password
	if (username && password)
		misc.query(req, res, data => {
			const user = data.shift()
			let status = 403
			if(user && bcrypt.compareSync(password, user['Password'])) {
				req.session.username = username;
				req.session.prefs = JSON.parse(user['Preferenze'])
				req.session.role = user['Ruolo']
				status = 200
			}
			res.sendStatus(status)
		})
	else
		misc.handleError('Invalid login request', res)
});

app.get(/\/.*/, (req, res) => misc.query(req, res))
app.patch(/\/.*/, (req, res) => misc.query(req, res))

/*---------END API---------*/

/***********SERVER START***********/
process.setMaxListeners(10);
const server = app.listen(INI.port, () => {
	console.log(`Express server listening on port ${INI.port}`)
})
