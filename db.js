const mysql = require('mysql2')
const { queryBuilder } = require('mysql-query-placeholders');
const fs = require('fs')
const ini = require('ini')

const QUERY_MAP = {
	'GET': {
		'/user_lists': `	SELECT l.ID id, l.Nome nome, l.Supermercato supermercato, g.Nome gruppo 
						FROM liste l JOIN gruppi g ON g.ID = l.Gruppo 
						WHERE 	l.Aperta = 1 AND 
								  l.Gruppo IN (SELECT gu.Gruppo FROM gruppi_utenti gu WHERE gu.Utente = :username) ORDER BY l.Data_creazione DESC`,
		
		'/list': `	SELECT l.ID id, l.Nome nome, s.Nome supermercato, s.ID supermercatoID, l.Richiedi_prezzi richiediPrezzi, l.Aperta aperta, l.Gruppo gruppo
					FROM liste l JOIN supermercati s ON s.ID = l.Supermercato WHERE l.ID = :id`,
		
		'/list_items': `	SELECT ol.Oggetto id, o.Nome nome, o.Note note, o.Prezzo prezzo, ol.Quantita quantita, ol.Acquirente acquirente
						FROM oggetti_liste ol
						JOIN oggetti o ON o.ID = ol.Oggetto
						WHERE ol.Lista = :id`
	},

	'POST': {
		'/': `SELECT Password, Ruolo, Preferenze FROM utenti WHERE Nome = :username`,
	},

	'PATCH': {
		'/list_item': `	UPDATE oggetti_liste
						SET Acquirente = :buyer, Prezzo_reale = :price, Data_checked = CURRENT_TIMESTAMP()
						WHERE Oggetto = :itemid AND Lista = :listid`,
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
		const sql = QUERY_MAP[method][action]

		if (!sql) return new Promise((resolve, reject) => resolve({ message: 'Action not found' }))

		let paramsNames = [], tmp = []
		while ((tmp = PLACEHOLDRES_REGEX.exec(sql)) !== null) paramsNames.push(tmp[0].substr(1));

		return new Promise((resolve, reject) => {
			for (const paramName of paramsNames)
				if(!params.hasOwnProperty(paramName))
					resolve({ message: `Missing parameter "${paramName}"` })
			this.connection.query(queryBuilder(sql, params), (err, rows) => { if (err) reject(err); else resolve(rows) })
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