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

        const uuid = this.generateUUID()
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
        const index = users.indexOf(users.find(user => user.uuid == client.uuid))

        cache.remove("users", index)
        if (pings[client.uuid]) {
            pings[client.uuid].client_disconnected = client.disconnected
            pings[client.uuid].disconnection_time = Date.now()
        }
        client.broadcast.emit("updateusers", {
            users: this.getAllUsers(),
            online_users: users.length
        })

        console.log(`User disconnected: ${client.uuid} (${client.id})`)

        return {
            success: true
        }
    },
    /**
     * @description Generates and returns a random UUID
     */
    generateUUID: function() {
        return ([1e7] + -1e3 + -4e3 + -8e3 + -1e11).replace(/[018]/g, c =>
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