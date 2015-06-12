/* Utility functions */
var rwlock = require('rwlock');

module.exports = (function() {
    this.models = {}; // Keeping track of what I've returned so far
    this.isOnlyDocument = function(docs) {
        if (docs !== null && docs.length == 1) {
            return true;
        }
        return false;
    }

    this.lock = new rwlock();

    return this;
})();




