const fs = require('fs')
const ini = require('ini')
const INI = ini.parse(fs.readFileSync('./app.ini', 'utf-8'))['events']
const server = require('http').createServer()

const io = require('socket.io')(server, {
    path: INI.path,
    pingInterval: 10000,
    pingTimeout: 5000,
    cors: {
        origin: '*',
        methods: ['GET', 'POST'],
        allowedHeaders: '*'
    }
})
server.listen(INI.port)
console.log(`Accepting event sockets on port ${INI.port} at ${INI.path}`)

io.on('connection', socket => {
    console.log(`New event socket => ${socket.handshake.headers.origin} as ${socket.handshake.query.username} on ${socket.nsp.name}`, '\r\n')
    /*TODO rooms
    for (const groupid in socket.handshake.query.groups.split(','))
        socket.join(`group/${groupid}`)
    console.log(socket.rooms);*/
})
    
module.exports = io