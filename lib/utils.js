/* Utility functions */
var rwlock = require('rwlock');

module.exports = (function() {
    this.models = {}; // Keeping track of connectedModels
    this.isOnlyDocument = function(docs) {
        if (docs !== null && docs.length == 1) {
            return true;
        }
        return false;
    }

    this.lock = new rwlock();

    this.setModel = function(Model, collection) {
        models[collection] = Model; 
    }

    this.within = function(collection) {
        if (!models[collection])
            return;

        return function(nlat, wlng, slat, elng) { 
            return models[collection].find({
                "coordinates": { //TODO replace with option
                    "$geoWithin": {
                        "$box": [
                            [wlng, slat],
                            [elng, nlat]
                        ]
                    }
                }
            });
        };
    }

    return this;
})();

