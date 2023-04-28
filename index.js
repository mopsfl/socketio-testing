/*
TODO:

> fix filter bypass when sending on cooldown


*/

const express = require("express")
const app = express()
const http = require("http")
const server = http.createServer(app)
const bodyParser = require("body-parser")
const { Server } = require("socket.io")
const wordFilter = require("bad-words")
const fs = require("fs")
const io = new Server(server, {
    cookie: {
        name: "sessionid",
        path: "/",
        httpOnly: true,
        sameSite: "lax",
    }
})
const cookies = require("cookie-parser");
const { serialize, parse } = require("cookie")

require("dotenv").config()

const regexes = {
    url: /[-a-zA-Z0-9@:%._\+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_\+.~#?&//=]*)?/gi
}

const string_encode_pattern = Math.floor(1500 * Math.random())

// UTILS

const user = require("./utils/user"),
    cache = require("./utils/cache"),
    misc = require("./utils/misc")
const cookieParser = require("cookie-parser")

// SERVER

app.use((res, req, next) => {
    res.header('Access-Control-Allow-Methods', 'GET');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.header('Access-Control-Allow-Credentials', true);
    next();
})
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(bodyParser.raw());
app.use(cookies());

app.get("/", (req, res, next) => {
    next()
})

app.get("/test", (req, res) => {
    try {
        return res.sendFile(__dirname + "/public/index.html")
    } catch (e) {
        console.error(e)
        return res.status(500).json({ code: 500, message: "Internal Server Error" })
    }
})

app.get("/server", (req, res) => {
    try {
        const users = user.getAllUsers()
        const messages = cache.get("messages")
        return res.json({ server: { users: users, messages: messages || [] } })
    } catch (e) {
        console.error(e)
        return res.status(500).json({ code: 500, message: "Internal Server Error" })
    }
})

app.get("/server/pings", (req, res) => {
    try {
        const pings = cache.get("pings")
        return res.json(pings)
    } catch (e) {
        console.error(e)
        return res.status(500).json({ code: 500, message: "Internal Server Error" })
    }
})

app.get("/server/users", (req, res) => {
    try {
        const users = user.getAllUsers()
        return res.json(users)
    } catch (e) {
        console.error(e)
        return res.status(500).json({ code: 500, message: "Internal Server Error" })
    }
})

server.listen(process.env.PORT || 3000, () => {
    console.log(`Listening on *:${process.env.PORT || 3000}`)
    cache.set("users", [])
    cache.set("usernames", [])
    cache.set("pings", {})
    cache.set("messages", [])
    cache.set("cooldowns", {
        changeusername: [],
        chatmessage: []
    })
})

// SOCKET.IO

io.on("connection", async(client) => {
    let cookies, username
    if (client.request.headers.cookie) cookies = misc.parseCookies(client.request.headers.cookie)
    username = await user.generateRandomUsername()
    if (!username) username = `${Math.floor(Math.random() * 1000000)}`

    const userdata = await user.createUser(client, { username: username })
    if (!userdata || !userdata.success) {
        console.warn("<Error>: Unable to create user session")
        return client.disconnect()
    }
    const users = cache.get("users")
    const pings = cache.get("pings")

    pings[client.uuid] = {
        total_pings: 0,
        last_ping: null,
        last_received_ping: null,
        last_received_ping_time: null,
        connection_time: Date.now(),
        disconnection_time: null,
        client_disconnected: client.disconnected,
    }
    client.emit("setcookie", {
        name: "sp",
        value: string_encode_pattern,
        days: 365
    })
    client.emit("setcookie", {
        name: "uuid",
        value: client.uuid,
        days: 365
    })
    client.send(JSON.stringify(userdata))
    client.emit("session", {
        uuid: client.uuid,
        username: client.username.filtered,
        id: client.id,
        online_users: users.length,
        users: user.getAllUsers(),
        ping: 0
    })

    client.on("disconnect", async() => {
        user.removeUser(client)
        const usernames = cache.get("usernames"),
            usernameame_index = usernames.indexOf(client.username.filtered)
        if (usernameame_index) cache.remove("usernames", usernameame_index)
    })
    client.on("ping", (callback) => {
        if (typeof callback == "function") callback()
    })
    client.on("setping", (ping) => {
        if (typeof ping == "number") {
            client.ping = ping
            if (!pings[client.uuid]) return
            pings[client.uuid] = {
                total_pings: pings[client.uuid].total_pings + 1,
                last_ping: pings[client.uuid].ping,
                last_received_ping: ping,
                last_received_ping_time: Date.now(),
                connection_time: pings[client.uuid].connection_time,
                disconnection_time: pings[client.uuid].disconnection_time,
                client_disconnected: client.disconnected,
            }
        }
    })

    client.on("newmessage", async(data) => {
        if (!data.message) return
        if (data.message.length > 69 || data.message.length < 1) return
        const cooldowns = cache.get("cooldowns").chatmessage
        if (!cooldowns || cooldowns.includes(client.uuid)) {
            client.emit("message", {
                message: "'newmessage' event blocked: cooldown active"
            })
            console.log("'newmessage' event blocked: cooldown active")
            return
        }
        let index = cache.push(cooldowns, client.uuid)
        setTimeout(() => {
            cache.remove(cooldowns, index)
            console.log(`newmessage cooldown removed: ${client.uuid}`)
        }, 350);

        const filter = new wordFilter()
        let filteredMessage = filter.clean(data.message)

        if (regexes.url.test(data.message)) {
            client.emit("message", {
                message: "'newmessage' event blocked: message contains a url"
            })
            return console.log("'newmessage' event blocked: message contains a url")
        }

        cache.push(cache.get("messages"), {
            message: data.message,
            filteredMessage: filteredMessage,
            uuid: client.uuid,
            time: Date.now()
        })

        io.emit("usermessage", {
            message: filteredMessage,
            uuid: client.uuid,
            username: client.username.filtered
        })

        console.log(`new message: ${filteredMessage} > ${client.uuid}`)
    })

    client.on("changeusername", async(packet) => {
        if (!packet || !packet.username) return
        if (packet.username.length > 20 || packet.username.length < 3) return
        const usernames = cache.get("usernames")
        const cooldowns = cache.get("cooldowns").changeusername

        if (!cooldowns || cooldowns.includes(client.uuid)) {
            client.emit("message", {
                message: "'changeusername' event blocked: cooldown active"
            })
            return console.log("'changeusername' event blocked: cooldown active")
        }
        let index = cache.push(cooldowns, client.uuid)
        setTimeout(() => {
            cache.remove(cooldowns, index)
            console.log(`changeusername cooldown removed: ${client.uuid}`)
        }, 1000);
        if (usernames && usernames.includes(packet.username)) {
            client.emit("message", {
                message: `username '${packet.username}' already in use`
            })
            return console.log(`username '${packet.username}' already in use`)
        }
        const filter = new wordFilter()

        if (regexes.url.test(packet.username)) {
            client.emit("message", {
                message: "'changeusername' event blocked: username contains a url"
            })
            return console.log("'changeusername' event blocked: username contains a url")
        }

        client.username = {
            raw: packet.username,
            filtered: filter.clean(packet.username),
            cookie: await misc.encodeString(JSON.stringify({
                raw: packet.username,
                filtered: filter.clean(packet.username)
            }), string_encode_pattern, Math.floor(10 * Math.random()), Math.floor(10 * Math.random()))
        }
        let lastName_index = usernames.indexOf(packet.username)
        if (lastName_index) cache.remove("usernames", lastName_index)

        cache.push(usernames, packet.username)

        console.log(`Changed username to: ${packet.username} > ${client.uuid}`)

        client.broadcast.emit("updateusers", {
            users: user.getAllUsers(),
            online_users: cache.get("users").length
        })
        client.emit("usernamechanged", client.username)
        client.emit("setcookie", {
            name: "username",
            value: client.username.cookie,
            days: 365
        })
    })

    client.on("login", async(packet) => {
        console.log("login request: ", packet)
        client.emit(`${client.uuid}_logincallback`, {
            value: await misc.encodeString("test", string_encode_pattern, 5, 5)
        })
    })
})

/*PING CHECK*/

setInterval(async() => {
    const pings = cache.get("pings")
    const sockets = io.sockets.sockets
    sockets.forEach(client => {
        if (!pings[client.uuid] || pings[client.uuid].client_disconnected) return
        if (((Date.now() - pings[client.uuid].connection_time) / 1000) < 2) return console.log(`ping check blocked (client to young): ${client.uuid}`)
        if (((Date.now() - pings[client.uuid].last_received_ping_time) / 1000) > 10) {
            client.failed_pings += 1
            console.log(`ping check failed (${client.failed_pings}): ${client.uuid}`)
        }
        if (client.failed_pings >= 3) {
            client.emit("socketcheck", () => {
                console.log(`ping check disconnection blocked. (socketcheck passed): ${client.uuid}`)
                return
            })
            console.log("disconnecting inactive client (pings failed): " + client.uuid)
            client.disconnect()
        }
    })
}, 2500);

global.io = io