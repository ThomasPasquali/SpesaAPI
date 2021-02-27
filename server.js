require('dotenv').config()
const http = require('http')
const express = require('express')
const fs = require('fs')
const ini = require('ini')
const misc = require('./misc')
const io = require('./events')
const cors = require('cors');
const jwt = require('jsonwebtoken')
require('./auth.js')

const app = express()
const parsedIni = ini.parse(fs.readFileSync('./app.ini', 'utf-8'))
const INI = parsedIni.api
const INI_DEV = parsedIni.dev
const LOGIN_EXCLUDED_URLS = ['/hash', '/']

/*---------MIDDLEWARE---------*/

app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))

function authenticateToken(req, res, next) {
	const authHeader = req.headers['authorization']
	const token = authHeader && authHeader.split(' ')[1]
	if (token == null) return res.sendStatus(401)

	if(!LOGIN_EXCLUDED_URLS.includes(req.originalUrl.split('?')[0]))
		jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, user) => {
			console.log(err)
			if (err) return res.status(403).send({ message: 'Authentication required' })
			req.user = user
			res.setHeader('Content-Type', 'application/json')
			next()
		})
	next()
}

app.use(authenticateToken)

app.use((req, res, next) => {
	console.log('Request from:', req.get('origin'), 'to', req.originalUrl);
	next()
	/*res.setHeader('Access-Control-Allow-Origin', req.get('origin')??'*')
	res.setHeader('Access-Control-Allow-Headers', 'content-type')
	res.setHeader('Access-Control-Allow-Credentials', 'true')*/
})

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

app.get(/\/.*/, (req, res) => misc.query(req, res))
app.post(/\/.*/, (req, res) => misc.query(req, res))
app.put(/\/.*/, (req, res) => misc.query(req, res))
app.patch(/\/.*/, (req, res) => misc.query(req, res))
app.delete(/\/.*/, (req, res) => misc.query(req, res))

/*---------END API---------*/

/***********SERVER START***********/
process.setMaxListeners(1000);
const server = app.listen(process.env.API_PORT, () => {
	console.log(`Express server listening on port ${process.env.API_PORT}\r\n`)
})
