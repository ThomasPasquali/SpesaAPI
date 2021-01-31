const bcrypt = require('bcrypt')
const db = require('./db')

const hash = password => bcrypt.hashSync(password, 10)

const handleError = (err, res) => {
	console.error(err)
	res.sendStatus(500)
}

const query = (req, res, thenCallback, catchCallback) => {
	const action = req.originalUrl.split('?')[0]
	const method = req.method.toUpperCase()
	const params = Object.assign(req.body??{}, req.query)

	console.log('Serving ', method, action, params.password?'VOOOOLEVI SBIRCIARE LA PASSWORD...':params)

	return db.query(method, action, params).then(data => {
		if(thenCallback) thenCallback(data)
		else {
			if(data.length === 1) data = data[0]
			res.status(data.message?400:200).send(data)
		}
	}).catch(err => {
		if(catchCallback) 	catchCallback(err)
		else 				handleError(err, res)
	})
}

module.exports = { hash, handleError, query }