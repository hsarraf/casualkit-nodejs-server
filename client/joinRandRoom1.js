"use strict"

const webSocket = require('ws');

const ws = new webSocket('ws://127.0.0.1:9000/?t_=12345&u_=hsarraf1');
//const ws = new webSocket('ws://api.segal.games/node/?ticket=12345&uid=bfeb8215-7774-4290-a980-85a1c4af3230');

ws.addEventListener('open', function() {
    console.log('-- connection opened');
    ws.send('r{"c_": 3}');
});

ws.addEventListener('message', function(socket) {
    console.log('-- msg recved: ' + socket.data);
    //ws.send('-- hi from client');
});

ws.addEventListener('close', function(e) {
    console.log('-- connection closed,', e.code);
    //clearTimeout(_pingTimeout);
});

ws.addEventListener('error', function(e) {
    console.log('-- connection error,', e.code);
    //clearTimeout(_pingTimeout);
});