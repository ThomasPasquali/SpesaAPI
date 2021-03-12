require('dotenv').config()
const http = require('http')
const express = require('express')
const fs = require('fs')
const ini = require('ini')
const misc = require('./misc')
const io = require('./events')
const cors = require('cors');
const jwt = require('jsonwebtoken')
const auth = require('./auth.js')

const app = express()
const parsedIni = ini.parse(fs.readFileSync('./app.ini', 'utf-8'))
const INI = parsedIni.api
const INI_DEV = parsedIni.dev

/*---------MIDDLEWARE---------*/

app.use((req, res, next) => {
	//console.log('Request from:', req.get('origin'), 'to', req.originalUrl);
	//console.log(req.headers)
	next()
	/*res.setHeader('Access-Control-Allow-Origin', req.get('origin')??'*')
	res.setHeader('Access-Control-Allow-Headers', 'content-type')
	res.setHeader('Access-Control-Allow-Credentials', 'true')*/
})
app.use(cors())
app.use(express.json())
app.use(express.urlencoded({ extended: true }))
app.use(auth)

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
