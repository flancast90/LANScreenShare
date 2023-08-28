const express = require('express');
const port = 8000;
const app = express();

const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);

app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({limit: '50mb', extended: true, parameterLimit: 50000}));

io.on('connection', (socket) => {
    console.log(`Client: ${socket.id} connected!`);

    socket.on('subscribe', (group) => {
        console.log(`Client: ${socket.id} joined group ${group}`);
        socket.join(group);
    });
});

app.get('/', (req, res) => {
    res.sendFile(__dirname + '/client_view.html');
});

app.post('/api/share', (req, res) => {
    // we expect the client to send us a JSON object with the image and group
    const group = req.body.group;
    let image = req.body.image;
    res.send('Success!');

    // we send the image to all clients in the group
    // get base64 image
    image = Buffer.from(image, 'base64');
    image = image.toString('base64');
    io.to(group).emit('share', image);
});

server.listen(port, () => {
    console.log(`🚀 Client Running on: http://localhost:${port}`);
});