/*
TODO:

> fix filter bypass when sending on cooldown
> logout function
> keep logged in using account-session

*/

const express = require("express")
const app = express()
const http = require("http")
const server = http.createServer(app)
const bodyParser = require("body-parser")
const { Server } = require("socket.io")
const wordFilter = require("bad-words")
const bcrypt = require("bcryptjs")
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

const string_encode_pattern = Math.floor(100 * Math.random())

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
app.get("/server/sessions", (req, res) => {
    try {
        const sessions = cache.get("sessions")
        return res.json(sessions)
    } catch (e) {
        console.error(e)
        return res.status(500).json({ code: 500, message: "Internal Server Error" })
    }
})

server.listen(process.env.PORT || 3000, async() => {
    console.log(`Listening on *:${process.env.PORT || 3000}`)

    // Create cache keys
    cache.set("users", [])
    cache.set("usernames", [])
    cache.set("pings", {})
    cache.set("messages", [])
    cache.set("accounts", [])
    cache.set("sessions", [])
    cache.set("cooldowns", {
        changeusername: [],
        chatmessage: []
    })

    //test accounts
    cache.push(cache.get("accounts"), {
        username: "mopsfl",
        password: "$2a$05$E8/6HI.E0/hWJi04wJyhj.UehAXE3bxS9lC/2QBzaorPhjpJpEA6e" //password: test
    })
    cache.push(cache.get("accounts"), {
        username: "blacky",
        password: "$2a$05$E8/6HI.E0/hWJi04wJyhj.UehAXE3bxS9lC/2QBzaorPhjpJpEA6e" //password: test
    })
    cache.push(cache.get("accounts"), {
        username: "stranger",
        password: "$2a$05$29KwSGU2Z5x7HGJSEsi2yOCXmP6/k3rrAqjFMecapsjJUvls3huzy" //password: password123
    })
})

// SERVER

io.on("connection", async(client) => {
    let cookies
    if (client.request.headers.cookie) cookies = misc.parseCookies(client.request.headers.cookie)

    const users = cache.get("users")
    const pings = cache.get("pings")

    pings[client.id] = {
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

    client.emit("session", {
        id: client.id,
        online_users: users.length,
        users: user.getAllUsers(),
        ping: 0
    })

    client.on("login", async(packet) => {
        console.log("login request: ", packet, ` > ${client.id}`)
        const accounts = cache.get("accounts")
        const sessions = cache.get("sessions")
        const account = accounts.find(account => account.username == packet.username && bcrypt.compareSync(packet.password, account.password))
        const logincallback = {
            state: null,
            value: null,
            session: null
        }

        if (account) {
            let session = encodeURIComponent(await misc.encodeString(JSON.stringify({
                    account: account,
                    session_created: Date.now(),
                    id: client.id
                }), string_encode_pattern)),
                blockRequest = false

            await sessions.forEach(async s => {
                if (JSON.parse(await misc.decodeString(decodeURIComponent(s), string_encode_pattern)).account.username == account.username) {
                    console.log("block")
                    blockRequest = true
                }
            })
            if (blockRequest) {
                logincallback.state = false
                logincallback.value = await misc.encodeString("Another session is already logged in with this account.", string_encode_pattern)
                client.emit(`${client.id}_logincallback`, logincallback, 1)
                console.log(`login request denied. another session is already logged in with this account. > ${client.id}`)
                return
            }
            logincallback.state = true
            logincallback.value = await misc.encodeString("Logging in...", string_encode_pattern)
            logincallback.session = session
            cache.push(sessions, session)
            client.session = session

            const userdata = await user.createUser(client, { username: account.username })
            if (!userdata || !userdata.success) {
                console.warn("<Error>: Unable to create user session")
                return client.disconnect()
            }
            client.emit("setcookie", {
                name: "uuid",
                value: userdata.uuid,
                days: 365
            })

            await client.emit(`${client.id}_logincallback`, {
                state: true,
                value: "Logged in!",
                userdata: {
                    uuid: userdata.uuid,
                    username: account.username
                }
            }, 2)
            console.log(`login request accepted: ${client.id}`)
        } else {
            logincallback.state = false
            logincallback.value = await misc.encodeString("Username or password invalid.", string_encode_pattern)
            console.log(`login request invalid: ${client.id}`)
        }

        client.emit(`${client.id}_logincallback`, logincallback, 1)
        if (logincallback.session) {
            client.emit(`setcookie`, {
                name: "account-session",
                value: logincallback.session,
                days: 7
            })
            client.emit("updateusers", {
                users: user.getAllUsers(),
                online_users: cache.get("users").length
            })
        }
    })

    client.on("disconnect", async() => {
        user.removeUser(client)

        //const usernames = cache.get("usernames"),
        //    usernameame_index = usernames.indexOf(client.username.filtered)
        //if (usernameame_index) cache.remove("usernames", usernameame_index)
    })
    client.on("ping", async(callback) => {
        if (typeof callback == "function") callback()
    })
    client.on("setping", async(packet) => {
        if (typeof packet.ping == "number") {
            client.ping = packet.ping
            if (!pings[client.id]) return
            pings[client.id] = {
                total_pings: pings[client.id].total_pings + 1,
                last_ping: pings[client.id].ping,
                last_received_ping: packet.ping,
                last_received_ping_time: Date.now(),
                connection_time: pings[client.id].connection_time,
                disconnection_time: pings[client.id].disconnection_time,
                client_disconnected: client.disconnected,
            }
        }
    })

    client.on("newmessage", async(data) => {
        if (!data || !data.message) return
        if (!await user.clientExists(client.uuid)) {
            client.emit("message", {
                event: "newmessage",
                message: "'newmessage' event blocked. invalid client session"
            })
            return console.log("'newmessage' event blocked. invalid client session")
        }
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

        for (const socket of await io.fetchSockets()) {
            if (user.clientExists(socket.uuid)) {
                socket.emit("usermessage", {
                    message: filteredMessage,
                    uuid: client.uuid,
                    username: client.username.filtered
                })
            }
        }

        console.log(`new message: ${filteredMessage} > ${client.uuid}`)
    })

    client.on("changeusername", async(packet) => {
        if (!packet || !packet.username) return
        if (!await user.clientExists(client.uuid)) {
            client.emit("message", {
                event: "changeusername",
                message: "'changeusername' event blocked. invalid client session"
            })
            return console.log("'changeusername' event blocked. invalid client session")
        }
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
                event: "changeusername",
                message: `username '${packet.username}' already in use`
            })
            return console.log(`username '${packet.username}' already in use`)
        }
        const filter = new wordFilter()

        if (regexes.url.test(packet.username)) {
            client.emit("message", {
                event: "changeusername",
                message: "'changeusername' event blocked: username contains a url"
            })
            return console.log("'changeusername' event blocked: username contains a url")
        }

        client.username = {
            raw: packet.username,
            filtered: filter.clean(packet.username)
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
    })

    client.on("getsp", () => {
        return client.emit("setcookie", {
            name: "sp",
            value: string_encode_pattern,
            days: 9e9
        })
    })
})

/*PING CHECK*/

setInterval(async() => {
    const pings = cache.get("pings")
    const sockets = io.sockets.sockets
    sockets.forEach(client => {
        if (!pings[client.id] || pings[client.id].client_disconnected) return
        if (((Date.now() - pings[client.id].connection_time) / 1000) < 2) return console.log(`ping check blocked (client to young): ${client.id}`)
        if (((Date.now() - pings[client.id].last_received_ping_time) / 1000) > 10) {
            if (!client.failed_pings) client.failed_pings = 0
            client.failed_pings += 1
            console.log(`ping check failed (${client.failed_pings}): ${client.id}`)
        }
        if (client.failed_pings >= 3) {
            client.emit("socketcheck", () => {
                console.log(`ping check disconnection blocked. (socketcheck passed): ${client.id}`)
                return
            })
            console.log("disconnecting inactive client (pings failed): " + client.id)
            client.disconnect()
        }
    })
}, 2500);

global.io = io