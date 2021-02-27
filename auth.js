require('dotenv').config()
const express = require('express')
const app = express()
const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')
const misc = require('./misc')
const fs = require('fs');
const ini = require('ini')
const INI = ini.parse(fs.readFileSync('./app.ini', 'utf-8')).auth

app.use(express.json())

let refreshTokens = []

app.post('/token', (req, res) => {
    const refreshToken = req.body.token
    if (refreshToken == null) return res.sendStatus(401)
    if (!refreshTokens.includes(refreshToken)) return res.sendStatus(403)
    jwt.verify(refreshToken, INI.refreshTokenSecret, (err, user) => {
        if (err) return res.sendStatus(403)
        const accessToken = generateAccessToken({ name: user.name })
        res.json({ accessToken: accessToken })
    })
})

app.delete('/logout', (req, res) => {
    refreshTokens = refreshTokens.filter(token => token !== req.body.token)
    res.sendStatus(204)
})

app.post('/login', (req, res) => {
    let username = req.body.username
    let password = req.body.password
    if (username && password)
        misc.query(req, res, data => {
            let user = data.shift()
            if (user && bcrypt.compareSync(password, user['Password'])) {
                user = {
                    name: username,
                    role: user['Ruolo'],
                    prefs: user['Preferenze']
                }
                req.user = user
                const accessToken = generateAccessToken(user)
                const refreshToken = jwt.sign(user, INI.refreshTokenSecret)
                refreshTokens.push(refreshToken)
                res.json({ accessToken: accessToken, refreshToken: refreshToken })
            } else
                res.status(403).json({ message: 'Invalid credentials' })
        })
    else 
        res.status(403).json({ message: 'Invalid request' })
})

function generateAccessToken(user) {
    return jwt.sign(user, INI.accessTokenSecret, { expiresIn: '15s' })
}

app.listen(process.env.AUTH_PORT, () => {
    console.log(`JWT auth server listening on port ${process.env.AUTH_PORT}`)
})