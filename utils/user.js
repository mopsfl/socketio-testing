const { Socket } = require("socket.io");
const cache = require("./cache")
const crypto = require('crypto');

module.exports = {
    /**
     * @argument { Socket } client
     * @description Creates and returns a new user object
     */
    createUser: async function(client, args) {
        const users = cache.get("users")
        if (!users) return "Unable to get key 'users' from cache"
        if (!client) return "Missing argument 'client'"

        const uuid = await this.generateUUID()
        client.uuid = uuid
        client.failed_pings = 0
        client.username = {
            raw: args.username,
            filtered: args.username,
        }
        cache.push(cache.get("users"), client)

        await client.broadcast.emit("updateusers", {
            users: this.getAllUsers(),
            online_users: users.length
        })

        console.log(`User connected: ${uuid} (${client.id})`)

        return {
            success: true,
            uuid: uuid,
        }
    },
    /**
     * @argument { Socket } client
     * @description Removes a user
     */
    removeUser: function(client) {
        if (!client) return "Missing argument 'client'"
        const users = cache.get("users")
        const pings = cache.get("pings")
        const clientIndex = users.indexOf(users.find(user => user.id == client.id))
        const sessionIndex = users.indexOf(users.find(session => session.session == client.session))
        if (clientIndex < 0 || sessionIndex < 0) return

        cache.remove("users", clientIndex)
        cache.remove("sessions", sessionIndex)
        if (pings[client.id]) {
            pings[client.id].client_disconnected = client.disconnected
            pings[client.id].disconnection_time = Date.now()
        }
        client.broadcast.emit("updateusers", {
            users: this.getAllUsers(),
            online_users: users.length
        })

        console.log(`User disconnected: ${client.uuid || "<uuid_not_found>"} (${client.id})`)

        return {
            success: true
        }
    },
    /**
     * Checks if a client exists with the given uuid
     * @param {String} uuid 
     */
    clientExists: async function(uuid) {
        const io = global.io
        if (!io || !uuid) return false

        for (const client of await io.fetchSockets()) {
            if (client.uuid == uuid) return true
        }
        return false
    },
    /**
     * @description Generates and returns a random UUID
     */
    generateUUID: async function() {
        return await ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
            (c ^ crypto.getRandomValues(new Uint8Array(1))[0] & 15 >> c / 4).toString(16)
        );
    },
    /**
     * Generates a random username with the format 'Player#XXXX' (X = random digit)
     * @returns { String } Example.: Player#0000
     */
    generateRandomUsername: async function() {
        if (!cache.get("usernames")) return "Unable to get key 'usernames' from cache"
        let username = `Player#${Math.floor(1000 + Math.random() * 9000)}`
        let usernames = cache.get("usernames")
        while (usernames.includes(username)) {
            username = `Player#${Math.floor(1000 + Math.random() * 9000)}`
        }
        return username
    },

    /**
     * 
     */
    getAllUsers: function() {
        const users = cache.get("users")
        if (!users) return "Unable to get key 'users' from cache"
        const uuids = []

        users.forEach(user => {
            uuids.push({
                uuid: user.uuid,
                username: user.username.filtered || "Player",
                ping: user.ping,
                failed_pings: user.failed_pings
            })
        });

        return uuids
    }
}