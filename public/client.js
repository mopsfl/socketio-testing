const socket = location.pathname != "/test" ? io() : "test"
let session = null,
    clientping = 0,
    servermessages = []

const fake_string_pattern = "_§ds§_"

io = () => socket;

/*VARIABLES*/

const main = document.querySelector("main"),
    loading = document.querySelector(".loading")

const userinfo = document.querySelector("[data-userinfo]"),
    ping = document.querySelector("[data-ping]"),
    usertemplate = document.querySelector("[data-usertemplate]"),
    userlist = document.querySelector("[data-userlist]"),
    dataonlineusers = document.querySelector("[data-onlineusers]"),
    messages = document.querySelector("[data-messages]"),
    messagetemplate = document.querySelector("[data-messagetemplate]"),
    msg = document.querySelector("[data-msg]"),
    sendmsg = document.querySelector("[data-sendmsg]"),
    usernameinput = document.querySelector("[data-usernameinput]"),
    changeusername = document.querySelector("[data-changeusername]")

/*FUNCTIONS*/

parseCookies = cookie => cookie.split(';').map(v => v.split('=')).reduce((acc, v) => {
    acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
    return acc
}, {})
encodeString = async function(str, pattern, fakestrings = 0, fakestring_length = 50) {
    if (typeof str != "string") return ["'str' must be a <string>"]
    if (typeof pattern != "number") return ["'pattern' must be a <number>"]
    if (typeof fakestrings != "number") return ["'fakestrings' must be a <number>"]
    const char_codes = new Array()
    let fake_str = ""

    if (fakestrings > 0) {
        for (var i = 0; i < fakestrings; i++) {
            let fstr = `${this.fake_string_pattern}${this.generateRandomString(fakestring_length)}${this.fake_string_pattern}`
            fake_str = fake_str + fstr
        }
    }
    str = str + fake_str
    str.split("").forEach(async c => char_codes.push(c.charCodeAt() + pattern))
    let enc_str = ""
    char_codes.forEach(c => enc_str = enc_str + String.fromCharCode(c))
    return enc_str
}
generateRandomString = function(length) {
    if (typeof length != "number") return ["'length' must be a <number>"]
    let result = '';
    const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charactersLength = characters.length;
    let counter = 0;
    while (counter < length) {
        result += characters.charAt(Math.floor(Math.random() * charactersLength));
        counter += 1;
    }
    return result;
}
decodeString = async function(str, pattern) {
    if (typeof str != "string") return ["'str' must be a <string>"]
    if (typeof pattern != "number") return ["'pattern' must be a <number>"]
    const char_codes = new Array()
    str.split("").forEach(async c => char_codes.push(c.charCodeAt() - pattern))
    let dec_str = ""
    char_codes.forEach(c => dec_str = dec_str + String.fromCharCode(c))
    dec_str = dec_str.replace(/(_§ds§_).*(_§ds§_)/g, "")
    return dec_str
}
setCookie = function(name, value, days) {
    var expires = "";
    if (days) {
        var date = new Date();
        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
        expires = "; expires=" + date.toUTCString();
    }
    document.cookie = name + "=" + (value || "") + expires + "; path=/";
}
notification = function(name, value) {

}

/*EVENTS*/

if (typeof socket != "string" && socket != "test") {
    socket.on("message", (packet) => {
        servermessages.push(packet)
        console.log(`<Server>: message`, packet)
    })

    socket.on("updateusers", async(data) => {
        console.log("<Server>: updateusers", data)
        if (!data || !data.users) return console.warn("<Event Error>: 'updateusers' event invalid. Missing data!")
        userlist.innerHTML = ""


        session.users = data.users
        session.online_users = data.users.length - 1

        if (data.users.length > 1) {
            data.users.forEach(user => {
                if (user.uuid == session.uuid) return
                if (!user.uuid || !user.username) return
                const user_template = usertemplate.content.cloneNode(true).children[0]
                user_template.innerText = user.username || user.uuid
                userlist.appendChild(user_template)
            });
        } else {
            userlist.innerHTML = "-"
        }

        dataonlineusers.innerText = `(${session.online_users})`
    })

    socket.on("session", async(data) => {
        console.log("<Server>: session", data)
        userlist.innerHTML = ""
        userinfo.innerHTML = `${data.username} &middot; ${data.uuid} &middot; `

        session = data
        dataonlineusers.innerText = `(${data.online_users-1})`

        if (data.users.length > 1) {
            data.users.forEach(user => {
                if (user.uuid == session.uuid) return
                if (!user.uuid || !user.username) return
                const user_template = usertemplate.content.cloneNode(true).children[0]
                user_template.innerText = user.username || user.uuid
                userlist.appendChild(user_template)
            });
        } else {
            userlist.innerHTML = "-"
        }

        setInterval(() => {
            const ping_start = Date.now();
            socket.emit("ping", () => {
                clientping = Date.now() - ping_start
                ping.innerText = `ping: ${clientping}ms`
                socket.emit("setping", clientping)
                console.log(`<Server>: updated ping > ${clientping}`)
            })
        }, 1000);

        main.classList.remove("hidden")
        loading.classList.add("hidden")
    })

    socket.on("socketcheck", (callback => {
        return callback()
    }))

    socket.on("usermessage", async(data) => {
        console.log("<Server>: usermessage", data)

        const message_template = messagetemplate.content.cloneNode(true).children[0]
        message_template.innerText = `(${data.uuid == session.uuid ? "You" : data.username}): ${data.message}`
        messages.appendChild(message_template)
    })

    socket.on("usernamechanged", (packet) => {
        console.log("<Server>: usernamechanged", packet)
        if (!packet || !packet.filtered) return

        session.username = packet.filtered
        userinfo.innerHTML = `${session.username} &middot; ${session.uuid} &middot; `
    })

    socket.on("setcookie", (packet) => {
        console.log("<Server>: setcookie", packet)
        if (!packet || !packet.name || !packet.value) return
        setCookie(packet.name, packet.value, packet.days)
    })

    socket.on("notification", (packet) => {
        console.log("<Server>: notification", packet)
        if (!packet || !packet.name || !packet.value) return

        console.log("notification: " + packet)
    })

    sendmsg.addEventListener("click", async(e) => {
        if (!msg.validity.valid) return

        let value = msg.value,
            packet = {
                message: value
            }
        await socket.emit("newmessage", packet)

        console.log("<Client>: sent event 'newmessage'", packet)
    })

    changeusername.addEventListener("click", async(e) => {
        if (!usernameinput.validity.valid || usernameinput.value.length < 3 || usernameinput.value.length > 20) return

        let value = usernameinput.value,
            packet = {
                username: value
            }
        await socket.emit("changeusername", packet)

        console.log("<Client>: sent event 'changeusername'", packet)
    })
} else {
    console.log(`<Client>: test view enabled ${location.hash != "" ? `<${location.hash}>` : ""}`)
    const test_players = Math.floor(10*Math.random())
    for (let i = 0; i < test_players; i++) {
        const user_template = usertemplate.content.cloneNode(true).children[0]
        user_template.innerText = `OnlyTwentyChars_${Math.floor(10000*Math.random())}`
        userlist.appendChild(user_template)
    }
    if(test_players < 1){
        userlist.innerHTML = "-"
    }

    dataonlineusers.innerText = `(${test_players})`

    setTimeout(() => {
        loading.classList.add("hidden")
        main.classList.remove("hidden")
    }, !location.hash.includes("noloading") ? 1000 : 0);
}