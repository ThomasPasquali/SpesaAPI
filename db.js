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

		'/shop_items': 'SELECT ID id, Nome nome, Note note, Prezzo prezzo, Supermercato supermercato FROM oggetti WHERE Supermercato = :shopid ORDER BY Nome ASC',

		'/list_item': `SELECT ol.Oggetto id, o.Nome nome, o.Note note, o.Prezzo prezzo, ol.Quantita quantita, ol.Acquirente acquirente
						FROM oggetti_liste ol
						JOIN oggetti o ON o.ID = ol.Oggetto
						WHERE ol.Lista = :listid AND o.ID = :itemid`,
		
		'/user_shops': `SELECT DISTINCT s.ID id, s.Nome nome, s.Localita localita, s.Citta citta
						FROM gruppi_utenti gu 
						JOIN gruppi_supermercati gs ON gs.Gruppo = gu.Gruppo 
						JOIN supermercati s ON s.ID = gs.Supermercato 
						WHERE gu.Utente = :username`,
		
		'/item': 'SELECT ID id, Nome nome, Note note, Prezzo prezzo, Supermercato supermercato FROM Oggetti WHERE ID = :itemid',
		
		'/groups': `SELECT DISTINCT g.ID id, g.Nome nome
					FROM gruppi g
					JOIN gruppi_utenti gu ON gu.Gruppo = g.ID
					WHERE gu.Utente = :username`,

		'/shop_user_recipes': `SELECT r.ID id, r.Nome nome, r.Descrizione descrizione
								FROM ricette r 
								JOIN gruppi_utenti gu ON gu.Gruppo = r.Gruppo
								WHERE gu.Utente = :username AND r.Supermercato = :shopid`,

		'/recipe_items': `SELECT o.ID id, o.Nome nome, o.Note note, o.Prezzo prezzo, o_r.Quantita quantita
							FROM ricette r 
							JOIN oggetti_ricette o_r ON o_r.Ricetta = r.ID
							JOIN oggetti o ON o.ID = o_r.Oggetto
							WHERE r.ID = :recipeid`,
							
	},

	'POST': {
		'/login': `SELECT Password, Ruolo, Preferenze FROM utenti WHERE Nome = :username`,
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
		},

		'/item': {
			sql: 'UPDATE oggetti SET ID = :id, Nome = :nome, Note = :note, Prezzo = :prezzo, Supermercato = :supermercato WHERE id = :id',
			then: (params, res, resolve, reject) => {
				if(res.affectedRows <= 0)
					db.connection.query(
						queryBuilder('INSERT INTO oggetti (Nome, Note, Prezzo, Supermercato) VALUES (:nome, :note, :prezzo, :supermercato)', params),
						(err, rows) => {
							if (err) reject(err)
							else db.query('GET', '/item', { itemid: rows.insertId }).then(res => resolve(res))
						})
				else resolve(res)
			}
		},

		'/newList': {
			sql: 'INSERT INTO liste(Nome, Gruppo, Supermercato) VALUES (:name, :group, :shopid)',
			then: (params, res, resolve, reject) => {
				db.connection.query('SELECT ID id FROM liste ORDER BY ID DESC LIMIT 1', (err, rows) => {
					if (err) reject(err)
					else resolve(rows[0].id)
				})
			}
		},

		'/list': (params, resolve) => {
			db.query('PUT', '/newList', {name: params.listname, group: params.group.id, shopid: params.shopid}).then(listid => {
				let promises = []
				for(item of params.items)
					promises.push(db.query('PUT', '/list_item', { itemid: item.id, listid, quantity: item.quantita }))
				console.log(Promise.all(promises))
				resolve({listid})
			})
			
		},

		'/recipe': {
			sql: 'INSERT INTO ricette(Nome, Descrizione, Supermercato, Gruppo) VALUES (:name, :description, :shopid, :groupid)',
			then: (params, res, resolve, reject) => {
				db.connection.query('SELECT ID id FROM ricette ORDER BY ID DESC LIMIT 1', (err, rows) => {
					if (err) reject(err)
					else resolve({recipeid: rows[0].id})
				})
			}
		},

		'/recipe_item': {
			sql: 'INSERT INTO oggetti_ricette(Oggetto, Ricetta, Supermercato) VALUES (:itemid, :recipeid, (SELECT Supermercato FROM ricette WHERE ID = :recipeid))',
			catch: (params, err, resolve, reject) => {
				if(err.errno === 1062) //Duplicate PK
					db.query('PATCH', '/quantity_recipe_item', params).then(res => resolve(res)).catch(err => reject(err));
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
		},

		'/quantity_recipe_item': 'UPDATE oggetti_ricette SET Quantita = Quantita + 1 WHERE Oggetto = :itemid AND Ricetta = :recipeid',
	},

	'DELETE': {
		'/list_item': {
			sql: `	DELETE FROM oggetti_liste WHERE Oggetto = :itemid AND Lista = :listid`,
			then: (params, res, resolve) => {
				console.log('Emitting removed_list_item', params)
				io.of('/').emit('removed_list_item', params)
				resolve(res)
			}
		},

		'/item': 'DELETE FROM oggetti WHERE ID = :itemid',

		'/recipe': 'DELETE FROM oggetti_ricette WHERE Ricetta = :recipeid; DELETE FROM ricette WHERE ID = :recipeid', 

		'/recipe_item': 'DELETE FROM oggetti_ricette WHERE Ricetta = :recipeid AND Oggetto = :itemid',
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

		if(typeof query === 'function')
			return new Promise((resolve, reject) => query(params, resolve, reject))

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