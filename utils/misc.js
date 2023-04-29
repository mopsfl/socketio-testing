module.exports = {
    /**
     * @description Parses cookies from a string
     * @param { String } cookie 
     * @returns { Object }
     */
    fake_string_pattern: "_§ds§_",
    parseCookies: cookie => cookie.split(';').map(v => v.split('=')).reduce((acc, v) => {
        acc[decodeURIComponent(v[0].trim())] = decodeURIComponent(v[1].trim());
        return acc
    }, {}),
    encodeString: async function(str, pattern, fakestrings = Math.floor(10 * Math.random()), fakestring_length = Math.floor(10 * Math.random())) {
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
    },
    generateRandomString: function(length) {
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
    },
    decodeString: async function(str, pattern) {
        if (typeof str != "string") return ["'str' must be a <string>"]
        if (typeof pattern != "number") return ["'pattern' must be a <number>"]
        const char_codes = new Array()
        str.split("").forEach(async c => char_codes.push(c.charCodeAt() - pattern))
        let dec_str = ""
        char_codes.forEach(c => dec_str = dec_str + String.fromCharCode(c))
        dec_str = dec_str.replace(/(_§ds§_).*(_§ds§_)/g, "")
        return dec_str
    }
}