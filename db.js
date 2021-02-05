const mysql = require('mysql2')
const { queryBuilder } = require('mysql-query-placeholders');
const fs = require('fs')
const ini = require('ini')
const io = require('./events');
const { resolve } = require('path');

const QUERY_MAP = {
	'GET': {
		'/user_lists': `SELECT l.ID id, l.Nome nome, l.Supermercato supermercato, g.Nome gruppo 
						FROM liste l JOIN gruppi g ON g.ID = l.Gruppo 
						WHERE 	l.Aperta = 1 AND 
								  l.Gruppo IN (SELECT gu.Gruppo FROM gruppi_utenti gu WHERE gu.Utente = :username) ORDER BY l.Data_creazione DESC`,

		'/list': `	SELECT l.ID id, l.Nome nome, s.Nome supermercato, s.ID supermercatoID, l.Richiedi_prezzi richiediPrezzi, l.Aperta aperta, l.Gruppo gruppo
					FROM liste l JOIN supermercati s ON s.ID = l.Supermercato WHERE l.ID = :listid`,

		'/list_items': `SELECT ol.Oggetto id, o.Nome nome, o.Note note, o.Prezzo prezzo, ol.Quantita quantita, ol.Acquirente acquirente
						FROM oggetti_liste ol
						JOIN oggetti o ON o.ID = ol.Oggetto
						WHERE ol.Lista = :listid`,

		'/shop_items': 'SELECT ID id, Nome nome, Note note, Prezzo prezzo FROM oggetti WHERE Supermercato = :shopid ORDER BY Nome ASC',

		'/list_item': `SELECT ol.Oggetto id, o.Nome nome, o.Note note, o.Prezzo prezzo, ol.Quantita quantita, ol.Acquirente acquirente
						FROM oggetti_liste ol
						JOIN oggetti o ON o.ID = ol.Oggetto
						WHERE ol.Lista = :listid AND o.ID = :itemid`
	},

	'POST': {
		'/': `SELECT Password, Ruolo, Preferenze FROM utenti WHERE Nome = :username`,

		
	},

	'PUT': {
		'/list_item': {
			sql: `INSERT INTO oggetti_liste(Oggetto, Lista, Quantita, Supermercato)
					VALUES (:itemid, :listid, :quantity, (SELECT Supermercato FROM oggetti WHERE ID = :itemid))`,
			then: (params, res, resolve, reject) => {
				db.query('GET', '/list_item', params).then(res => {
					console.log('Emitting item_quantity_updated', { listid: params.listid, item: res[0] })
					io.of('/').emit('new_list_item', { listid: params.listid, item: res[0] })
				}).catch(err => reject(err));
				resolve(res)
			},
			catch: (params, err, resolve, reject) => {
				if(err.errno === 1062) //Duplicate PK
					db.query('PATCH', '/quantity_list_item', params).then(res => resolve(res)).catch(err => reject(err));
				else
					reject(err)
			}
		}
	},

	'PATCH': {
		'/buyer_list_item': {
			sql: `	UPDATE oggetti_liste
					SET Acquirente = :buyer, Prezzo_reale = :price, Data_checked = CURRENT_TIMESTAMP()
					WHERE Oggetto = :itemid AND Lista = :listid`,
			then: (params, rows, resolve) => {
				const values = { itemid: params.itemid, listid: params.listid, buyer: params.buyer }
				console.log('Emitting item_bought', values)
				io.of('/').emit('item_bought', values)
				resolve(rows)
			}
		},
		'/quantity_list_item': {
			sql: `	UPDATE oggetti_liste
					SET Quantita = Quantita + :quantity
					WHERE Oggetto = :itemid AND Lista = :listid`,
			then: (params, res, resolve, reject) => {
				db.query('GET', '/list_item', params).then(res => {
					console.log('Emitting item_quantity_updated', { listid: params.listid, item: res[0] })
					io.of('/').emit('item_quantity_updated', { listid: params.listid, item: res[0] })
				}).catch(err => reject(err));
				resolve(res)
			}
		}
	},

	'DELETE': {
		'/list_item': {
			sql: `	DELETE FROM oggetti_liste WHERE Oggetto = :itemid AND Lista = :listid`,
			then: (params, res, resolve) => {
				console.log('Emitting removed_list_item', params)
				io.of('/').emit('removed_list_item', params)
				resolve(res)
			}
		}
	}

}

const PLACEHOLDRES_REGEX = new RegExp(':[a-z]+', 'g')

class Database {

	constructor(config) {
		const connection = mysql.createConnection(config)
		connection.connect(err => {
			if (err) {
				console.error('Error connecting to database', err)
				process.exit(1)
			}
		})
		this.connection = connection
	}

	query(method, action, params) {
		const query = QUERY_MAP[method.toUpperCase()][action]

		if (!query) return new Promise((resolve, reject) => resolve({ message: 'Action not found' }))
		const sql = query.sql ?? query

		let paramsNames = [], tmp = []
		while ((tmp = PLACEHOLDRES_REGEX.exec(sql)) !== null) paramsNames.push(tmp[0].substr(1));

		return new Promise((resolve, reject) => {
			for (const paramName of paramsNames)
				if (!params.hasOwnProperty(paramName))
					resolve({ message: `Missing parameter "${paramName}"` })
			this.connection.query(queryBuilder(sql, params), (err, rows) => {
				if (err) {
					if(query.catch) query.catch(params, err, resolve, reject)
					else 			reject(err)
				} else {
					if (query.then) query.then(params, rows, resolve, reject)
					else 			resolve(rows)
				}
			})
		})
	}

	close() {
		return new Promise((resolve, reject) => {
			this.connection.end(err => {
				if (err) reject(err)
				else resolve()
			})
		})
	}

}

const db = new Database(ini.parse(fs.readFileSync('./app.ini', 'utf-8')).db)
module.exports = db