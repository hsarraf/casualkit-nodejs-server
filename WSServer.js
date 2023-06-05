"use strict"

const http = require('http');
const url = require('url');
const webSocket = require('ws');

const server = http.createServer();
const wss = new webSocket.WebSocketServer({ noServer: true });

const PORT = process.env.PORT || 9000;
server.listen(PORT);

server.on('upgrade', async (request, socket, head) => {
    let ticket = url.parse(request.url, true).query.t_;
    let username = url.parse(request.url, true).query.u_;
    let roomName = url.parse(request.url, true).query.r_;
    if (url.parse(request.url).pathname === "/quick/" //&& 
        /*await isAuthorized(ticket, username)*/) {
        print("-- authorized");
        wss.handleUpgrade(request, socket, head, (ws) => {
            ws.uid = username;
            ws.room = null;
            ws.ts = currentTimestamp();
            ws.broadcast = (data) => {
                ws.room.socks.forEach(sock => {
                    if (sock !== ws && sock.readyState === webSocket.WebSocket.OPEN)
                        sock.send(data);
                });
            }
            socks[ws.uid] = ws;
            checkIn(ws, roomName);
            wss.emit('connection', ws, request);
        });
    }
    else {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        print("-- unauthorized: destroying socket..");
    }
});

// redis handler
//
//const { isAuthorized, getTiles, setProp } = require('./redisHandler.js');

// json validators
//
//const { validateSetProp, validateGetTiles } = require('./jsonValidator');

var rooms = {};
var socks = {};

// room -> {socks = [], name = "room1", cap : 2, ts: 14234234, ticket: "t3454", full = false}

function validatePlayer() {
    return true;
}

// creating connection using websocket
//
wss.on("connection", (ws) => {
    print("connected: " + ws.uid);
    printSocks();

    ws.on("message", data => {
        print('-- recieved: ' + data);
        console.log(data[0]);
        try {
            if (data[0] === BROADCAST_OP) {
                ws.broadcast(data);
                return;
            }
            let op = data[0];
            let payload = JSON.parse(data.toString().substring(1));
            if (op === SYNC_OP) {
                ws.broadcast(data);
            }
            else if (op === INSTANTIATE_OBEJCT_OP) {
                ws.broadcast(data);
            }
            else if (op === DESTROY_OBJECT_OP) {
                ws.broadcast(data);
            }
            else if (op === CREATE_ROOM_OP) {
                createRoom(payload.roomName, payload.roomCap, ws);
            }
            else if (op === CREATE_OR_JOIN_OP) {
                createOrJoin(payload.roomCap, ws);
            }
            else if (op === JOIN_ROOM_BY_NAME_OP) {
                joinByName(payload.roomName, ws);
            }
            else if (op === LEAVE_ROOM_OP) {
                leaveRoom(payload.roomName, payload.vidList, ws);
            }
            else if (op === KILL_SOCKET_OP) {
                ws.close();
            }
            else {
                ws.close();
            }
        }
        catch (ex) {
            print('ERROR: ' + ex);
            ws.close();
        }
        // finally {
        //     printRooms();
        // }
    });

    ws.on("close", (errCode, errDescr) => {
        print("-- close: " + errCode + ", " + errDescr, 'error');
        if (ws.room) {
            ws.broadcast(String.fromCharCode(OPP_DISCONNECTED) + JSON.stringify({ status:'disconnected', oppUid: ws.uid }));
        }
        deleteSocket(ws);
        printRooms();
        printSocks();
    });
    // handling client connection error

    ws.on("error", (errCode, errDescr) => {
        print("-- error: " + errCode + ", " + errDescr, 'error');
    });

});

print("The WebSocket server is running on port " + PORT);

///// functions ///////////////////////////////////////////////

const ROOM_EXP_SECONDS = 5000;

const ROOMS_CLEANUP_INTERVAL = 10000;
const SOCKS_CLEANUP_INTERVAL = 17000;

const CHECKED_IN_OP = 104; // h: join room by name
const BROADCAST_OP = 98; // b: broadcast
const CREATE_ROOM_OP = 99; // c: create room
const CREATE_OR_JOIN_OP = 114; // r: join random room
const JOIN_ROOM_BY_NAME_OP = 106; // j: join room by name
const OPP_JOINED_ROOM_OP = 111; // o: opp joined room by name
const LEAVE_ROOM_OP = 101; // e: leave room
const OPP_LEFT_ROOM_OP = 109; // m: opp left room
const OPP_DISCONNECTED = 120; // x: opp disconnected
const INSTANTIATE_OBEJCT_OP = 105; // i: instantiate object
const DESTROY_OBJECT_OP = 121; // y: destroy object
const SYNC_OP = 115; // s: destroy object
const KILL_SOCKET_OP = 107; // k: kill socket
const ROOM_FULL_OP = 108; // l: room full 

function checkIn(ws, roomName) {
    /* verify the player */
    tryRejoin(roomName, ws);
}

function createRoom(name, cap, ws, createJoin = false, ticket = null) {
    let room = rooms[name];
    if (!room) {
        room = { name: name, socks: [ws], cap: cap, ts: currentTimestamp(), ticket: ticket, full: false };
        room.broadcast = (data) => room.socks.forEach(sock => sock.send(data));
        rooms[name] = room;
        ws.room = room;
        ws.send(String.fromCharCode(createJoin ? CREATE_OR_JOIN_OP : CREATE_ROOM_OP) + JSON.stringify({ status: "success", roomName: name, roomCap: cap })); // Set another name //
    }
    else {
        ws.send(`${String.fromCharCode(createJoin ? CREATE_OR_JOIN_OP : CREATE_ROOM_OP)}{"status": "alreadyExists"}`); // Set another name //
    }
    printRooms();
}

function isSockInRoom(ws, room) {
    for(let sock of room.socks)
        if (sock.uid == ws.uid)
            return true;
    return false;
}

function createOrJoin(cap, ws) {
    for (let roomName in rooms) {
        let room = rooms[roomName];
        if (!isSockInRoom(ws, room) && room.socks.length < room.cap && !room.full && room.ticket == null && currentTimestamp() - room.ts < ROOM_EXP_SECONDS) {
            room.socks.push(ws);
            ws.room = room;
            ws.send(String.fromCharCode(CREATE_OR_JOIN_OP) + JSON.stringify({ status: "success", roomName: roomName, roomCap: cap })); // Set another name //
            ws.broadcast(String.fromCharCode(OPP_JOINED_ROOM_OP) + JSON.stringify({ oppUid: ws.uid }));
            prepareRoomIfComplete(room);
            printRooms();
            return;
        }
    };
    createRoom(randRoomName(8), cap, ws, true);
}

function joinByName(roomName, ws, ticket = null) {
    let room = rooms[roomName];
    if (room && room.socks.length < room.cap && !room.full && room.ticket === ticket && currentTimestamp() - room.ts < ROOM_EXP_SECONDS) {
        room.socks.push(ws);
        ws.room = room;
        ws.send(String.fromCharCode(JOIN_ROOM_BY_NAME_OP) + JSON.stringify({ status: "success", roomName: roomName, roomCap: cap })); // Set another name //
        ws.broadcast(String.fromCharCode(OPP_JOINED_ROOM_OP) + JSON.stringify({ oppUid: ws.uid }));
        prepareRoomIfComplete(room);
    }
    else {
        ws.send(String.fromCharCode(JOIN_ROOM_BY_NAME_OP) + JSON.stringify({ status: "invalid" })); // Set another name //
    }
    printRooms();
}

function tryRejoin(roomName, ws) {
    if (roomName) {
        let room = rooms[roomName];
        console.log(room);
        if (room && room.socks.length < room.cap && currentTimestamp() - room.ts < ROOM_EXP_SECONDS) {
            room.socks.push(ws);
            ws.room = room;
            ws.ts = currentTimestamp();
            ws.send(String.fromCharCode(CHECKED_IN_OP) + JSON.stringify({ status: "inRoom", roomName: room.name, roomCap: room.cap })); // Set another name //
            prepareRoomIfComplete(room);
        }
        else {
            ws.send(String.fromCharCode(CHECKED_IN_OP) + JSON.stringify({ status: "fail" })); // Set another name //
        }
    }
    else {
        ws.send(String.fromCharCode(CHECKED_IN_OP) + JSON.stringify({ status: "connected" })); // lobby //
    }
    printRooms();
}

function leaveRoom(roomName, vidList, ws) {
    let room = rooms[roomName];
    if (!room || !ws.room || ws.room.name !== roomName) {
        //ws.close();
        return;
    }
    if (room.socks.includes(ws)) {
        ws.broadcast(String.fromCharCode(OPP_LEFT_ROOM_OP) + JSON.stringify({ oppUid: ws.uid, vidList: vidList }));
        room.socks.splice(room.socks.indexOf(ws), 1);
        ws.room = null;
    }
    removeRoomIfEmpty(room);
    printRooms();
}

function currentTimestamp() {
    return Date.now() / 1000;
}

const RANDOM_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randRoomName(len) {
    let result = '';
    for (let i = 0; i < len; i++)
        result += RANDOM_CHARS.charAt(Math.floor(Math.random() * 62));
    return result;
}

function prepareRoomIfComplete(room) {
    if (room.socks.length >= room.cap) {
        if (!room.full)
            room.broadcast(String.fromCharCode(ROOM_FULL_OP));
        room.full = true;
    }
}

function removeRoomIfEmpty(room) {
    if (room && room.socks.length === 0 || currentTimestamp() - room.ts >= ROOM_EXP_SECONDS) {
        delete rooms[room.name];
    }
}

function deleteRoom(room) {
    room.socks.forEach(ws => {
        ws.close();
    });
    delete rooms[room.name];
}

function deleteSocket(ws) {
    if (ws.room) {
        let room = rooms[ws.room.name];
        if (room && room.socks.includes(ws))
            room.socks.splice(room.socks.indexOf(ws), 1);
        removeRoomIfEmpty(room);
    }
    delete socks[ws.uid];
}

function printRooms() {
    let s = '';
    for (let name in rooms) {
        s += '[' + name + ']: ';
        for (let sock of rooms[name].socks)
            s += sock.uid + ', ';
        s += '\n';
    }
    print('rooms: \n' + s, 'room');
}

function printSocks() {
    let s = '';
    for (let uid in socks)
        s += uid + ', ';
    print('socks: ' + s, 'sock');
}

function print(msg, type) {
    if (type === undefined)
        console.log('\x1b[37m', msg);
    else if (type === 'room')
        console.log('\x1b[36m', msg);
    else if (type === 'sock')
        console.log('\x1b[32m', msg);
    else if (type === 'error')
        console.log('\x1b[31m', msg);
}

// setInterval(() => {
//     print("Socks cleanup..");
//     for(let uid in socks) {
//         if (currentTimestamp() - socks[uid].ts > SOCK_EXP_SECONDS)
//             deleteSock(socks[uid]);
//     }
// }, SOCKS_CLEANUP_INTERVAL);

// setInterval(() => {
//     print("Rooms cleanup..");
//     for(let name in rooms) {
//         if ( currentTimestamp() - rooms[name].ts > ROOM_EXP_SECONDS)
//             deleteRoom(rooms[name]);
//     }
// }, ROOMS_CLEANUP_INTERVAL);
