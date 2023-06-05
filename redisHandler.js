"use strict"

const redis = require('redis');

console.log("redis starting..");
const client = redis.createClient({
    socket: {
        host: '127.0.0.1',
        //path: '/var/run/redis/redis.sock',
        port: 6379
    },
    password: 'qMHIVG7ATrzIyySnH6IE3NWL/Ei+xox9Lthl3dMhRFf+c5nLbBpvYqlV'
    //password: process.env.REDIS_PASS
});

client.on('connect', function() {
    console.log('TORR: redis connected.');
});
client.on("error", function (err) {
    console.error("TORR: error on redis, " + err);
});
client.connect();

exports.isAuthorized = async (ticket, uid) => {
    try {
        let val = await client.get(`:ticket:${ticket}`);
        if (val === uid) {
            console.log('-- redis: uid matched.');
            client.del(`:ticket:${ticket}`);
            return true;
        }
        else {
            console.log('-- redis: uid not matched.');
            return false;
        }
    }
    catch (ex) {
        console.log('-- redis error: ' + ex);
        return false;
    }
}

exports.getTiles = async t => {
    try {
        let tiles = {};
        for(let tile of t.tiles) {
            let props = await client.hGetAll(tile);
            tiles[tile] = [];
            for (let pdat of Object.values(props)) {
                tiles[tile].push(JSON.parse(pdat));
            }
        }
        return tiles;
    }
    catch (ex) {
        console.log('-- redis error: ' + ex);
        return null;
    }
}

exports.setProp = async p => {
    try {
        await client.hSet(p.t, p.n, `{"n":"${p.n}","i":"${p.i}","o":"${p.o}","p":"${p.p}","r":"${p.r}","s":"${p.s}","m":${JSON.stringify(p.m)}}`);
        return true;
    }
    catch (ex) {
        console.log('-- redis error: ' + ex);
        return false;
    }

}
