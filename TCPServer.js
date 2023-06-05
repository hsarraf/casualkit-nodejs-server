"use strict"

const net = require('net')
const server = net.createServer()

const PORT = process.env.PORT || 9000;

server.listen(PORT);

server.on('error', (e) => {
    if (e.code === 'EADDRINUSE') {
      console.error('Address in use, retrying...');
      setTimeout(() => {
        server.close();
        server.listen(PORT);
      }, 1000);
    }
  });

// redis handler
//
//const { isAuthorized, getTiles, setProp } = require('./redisHandler.js');

var rooms = {};
var socks = {};

// room -> {socks = [], name = "room1", cap : 2, ts: 14234234, ticket: "t3454", full = false}

async function validate(ticket, username, roomName, tcp) {
    if (true/*await isAuthorized(ticket, username)*/) {
        tcp.uid = username;
        tcp.room = null;
        tcp.ts = currentTimestamp();
        tcp.broadcast = (data) => {
            tcp.room.socks.forEach(sock => {
                if (sock !== tcp && sock.readyState === tcp.Socket.OPEN)
                    sock.write(data);
            });
        }
        socks[tcp.uid] = tcp;
        checkIn(tcp, roomName);
    }
    else {
        tcp.destroy();
    }
}

server.on('connection', tcp => {
    printSocks();
    tcp.once("data", async data => {
        try {
            let op = data[0];
            console.log(op);
            let payload = JSON.parse(data.toString().substring(1));
            console.log(payload);
            if (op === VALIDATION_OP && payload.status === 'validation') {
                await validate(payload.ticket, payload.username, payload.roomName, tcp)
                    bind(tcp);
                }
            else
                tcp.destroy();
        }
        catch (ex) {
            print('-- error ex: ' + ex);
            tcp.close();
        }
    });
    tcp.on("close", (reason) => {
        print("-- close: " + reason);
    });
    tcp.on("error", (err) => {
        print("-- error err: " + err);
    });
    tcp.write(String.fromCharCode(VALIDATION_OP));
});

function bind(tcp) {
    tcp.on("data", data => {
        print('-- recieved: ' + data);
        try {
            if (data[0] === BROADCAST_OP) {
                tcp.broadcast(data);
                return;
            }
            let op = data[0];
            let payload = JSON.parse(data.toString().substring(1));
            if (op === SYNC_OP) {
                tcp.broadcast(data);
            }
            else if (op === INSTANTIATE_OBEJCT_OP) {
                tcp.broadcast(data);
            }
            else if (op === DESTROY_OBJECT_OP) {
                tcp.broadcast(data);
            }
            else if (op === CREATE_ROOM_OP) {
                createRoom(payload.roomName, payload.roomCap, tcp);
            }
            else if (op === CREATE_OR_JOIN_OP) {
                createOrJoin(payload.roomCap, tcp);
            }
            else if (op === JOIN_ROOM_BY_NAME_OP) {
                joinByName(payload.roomName, tcp);
            }
            else if (op === LEAVE_ROOM_OP) {
                leaveRoom(payload.roomName, payload.vidList, tcp);
            }
            else if (op === KILL_SOCKET_OP) {
                tcp.close();
            }
            else {
                tcp.close();
            }
        }
        catch (ex) {
            print('--  error: ' + ex);
            tcp.close();
        }
        // finally {
        //     printRooms();
        // }
    });

    tcp.on("close", (reason) => {
        print("-- close: " + reason);
        if (tcp.room) {
            tcp.broadcast(String.fromCharCode(OPP_DISCONNECTED) + JSON.stringify({ status:'disconnected', oppUid: tcp.uid }));
        }
        deleteSocket(tcp);
        printRooms();
        printSocks();
    });
    // handling client connection error

    tcp.on("error", (err) => {
        print("-- error: " + err);
    });
}


print("The WebSocket server is running on port " + PORT);

///// functions ///////////////////////////////////////////////

const ROOM_EXP_SECONDS = 5000;

const ROOMS_CLEANUP_INTERVAL = 10000;
const SOCKS_CLEANUP_INTERVAL = 17000;

const VALIDATION_OP = 118; // v: validation
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

function checkIn(tcp, roomName) {
    /* verify the player */
    tryRejoin(roomName, tcp);
}

function createRoom(name, cap, tcp, createJoin = false, ticket = null) {
    let room = rooms[name];
    if (!room) {
        room = { name: name, socks: [tcp], cap: cap, ts: currentTimestamp(), ticket: ticket, full: false };
        room.broadcast = (data) => room.socks.forEach(sock => sock.write(data));
        rooms[name] = room;
        tcp.room = room;
        tcp.write(String.fromCharCode(createJoin ? CREATE_OR_JOIN_OP : CREATE_ROOM_OP) + JSON.stringify({ status: "success", roomName: name, roomCap: cap })); // Set another name //
    }
    else {
        tcp.write(`${String.fromCharCode(createJoin ? CREATE_OR_JOIN_OP : CREATE_ROOM_OP)}{"status": "alreadyExists"}`); // Set another name //
    }
    printRooms();
}

function isSockInRoom(tcp, room) {
    for(let sock of room.socks)
        if (sock.uid == tcp.uid)
            return true;
    return false;
}

function createOrJoin(cap, tcp) {
    for (let roomName in rooms) {
        let room = rooms[roomName];
        if (!isSockInRoom(tcp, room) && room.socks.length < room.cap && !room.full && room.ticket == null && currentTimestamp() - room.ts < ROOM_EXP_SECONDS) {
            room.socks.push(tcp);
            tcp.room = room;
            tcp.write(String.fromCharCode(CREATE_OR_JOIN_OP) + JSON.stringify({ status: "success", roomName: roomName, roomCap: cap })); // Set another name //
            tcp.broadcast(String.fromCharCode(OPP_JOINED_ROOM_OP) + JSON.stringify({ oppUid: tcp.uid }));
            prepareRoomIfComplete(room);
            printRooms();
            return;
        }
    };
    createRoom(randRoomName(8), cap, tcp, true);
}

function joinByName(roomName, tcp, ticket = null) {
    let room = rooms[roomName];
    if (room && room.socks.length < room.cap && !room.full && room.ticket === ticket && currentTimestamp() - room.ts < ROOM_EXP_SECONDS) {
        room.socks.push(tcp);
        tcp.room = room;
        tcp.write(String.fromCharCode(JOIN_ROOM_BY_NAME_OP) + JSON.stringify({ status: "success", roomName: roomName, roomCap: cap })); // Set another name //
        tcp.broadcast(String.fromCharCode(OPP_JOINED_ROOM_OP) + JSON.stringify({ oppUid: tcp.uid }));
        prepareRoomIfComplete(room);
    }
    else {
        tcp.write(String.fromCharCode(JOIN_ROOM_BY_NAME_OP) + JSON.stringify({ status: "invalid" })); // Set another name //
    }
    printRooms();
}

function tryRejoin(roomName, tcp) {
    if (roomName) {
        let room = rooms[roomName];
        console.log(room);
        if (room && room.socks.length < room.cap && currentTimestamp() - room.ts < ROOM_EXP_SECONDS) {
            room.socks.push(tcp);
            tcp.room = room;
            tcp.ts = currentTimestamp();
            tcp.write(String.fromCharCode(CHECKED_IN_OP) + JSON.stringify({ status: "inRoom", roomName: room.name, roomCap: room.cap })); // Set another name //
            prepareRoomIfComplete(room);
        }
        else {
            tcp.write(String.fromCharCode(CHECKED_IN_OP) + JSON.stringify({ status: "fail" })); // Set another name //
        }
    }
    else {
        tcp.write(String.fromCharCode(CHECKED_IN_OP) + JSON.stringify({ status: "connected" })); // lobby //
    }
    printRooms();
}

function leaveRoom(roomName, vidList, tcp) {
    let room = rooms[roomName];
    if (!room || !tcp.room || tcp.room.name !== roomName) {
        //ws.close();
        return;
    }
    if (room.socks.includes(tcp)) {
        tcp.broadcast(String.fromCharCode(OPP_LEFT_ROOM_OP) + JSON.stringify({ oppUid: tcp.uid, vidList: vidList }));
        room.socks.splice(room.socks.indexOf(tcp), 1);
        tcp.room = null;
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
    room.socks.forEach(tcp => {
        tcp.close();
    });
    delete rooms[room.name];
}

function deleteSocket(tcp) {
    if (tcp.room) {
        let room = rooms[tcp.room.name];
        if (room && room.socks.includes(tcp))
            room.socks.splice(room.socks.indexOf(tcp), 1);
        removeRoomIfEmpty(room);
    }
    delete socks[tcp.uid];
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
