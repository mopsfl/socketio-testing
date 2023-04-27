const cache = {}

module.exports = {
    getcache: function() { return cache },
    get: function(index) {
        return cache[index]
    },
    set: function(index, value) {
        if (!index || !value) return
        if (typeof index == "string" || typeof index == "number") cache[index] = value
        if (typeof index == "object") cache[index] = value
    },
    remove: function(index, indexOf) {
        if (!index || !indexOf && indexOf > 0) return
        if (typeof index == "string" || typeof index == "number") this.get(index).splice(indexOf, 1)
        if (typeof index == "object") index.splice(indexOf, 1)
    },
    push: function(array, value) {
        if (!array || !value || !array.push) return
        let index = array.push(value)
        return index - 1
    }
}