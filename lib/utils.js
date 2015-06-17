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

    // Helper method for checking node boundry crossings/overlaps
    // tree: quadtree document
    // bounds: {'en': [lon. lat], 'ws': [lon, lat]}
    // dir: one of the following 'wn', 'ws', 'en', 'es'
    this.crossesNode = function(tree, bounds, dir) {
        //                en[0,1]
        //       _________
        //      |         |
        //      |         |
        //      | c[0,1]  |
        //      |         |
        //      |_________|
        //
        // ws[0, 1]
        //
        //    self.nw = new facilityNode(self.nlat, self.wlng, self.center.lat, self.center.lng);
        //    self.ne = new facilityNode(self.nlat, self.center.lng, self.center.lat, self.elng);
        //    self.sw = new facilityNode(self.center.lat, self.wlng, self.slat, self.center.lng);
        //    self.se = new facilityNode(self.center.lat, self.center.lng, self.slat, self.elng);
        
        
        switch(dir) {
            case 'wn':
                // nw, center //en[1] s[0]
                if ((tree.en[1] < bounds.ws[1] || tree.center[0] < bounds.ws[0])  
                   || (tree.center[1] > bounds.en[1] || tree.ws[0] > bounds.en[0])) {
                    return false;
                }
    
                return true;
    
            case 'en':
                // ne, center //en[1] en[0]
                if ((tree.en[1] < bounds.ws[1] || tree.en[0] < bounds.ws[0])
                   || (tree.center[1] > bounds.en[1] || tree.center[0] > bounds.en[0])) {
                    return false;
                }
    
                return true;
    
            case 'ws':
                // ws, center //ws[1] ws[0]
                if ((tree.center[1] < bounds.ws[1] || tree.center[0] < bounds.ws[0])
                   || (tree.ws[1] > bounds.en[1] || tree.ws[0] > bounds.en[0])) {
                    return false;
                }
    
                return true;
    
            case 'es':
                // se, center //ws[1] en[0]
                if ((tree.center[1] < bounds.ws[1] || tree.en[0] < bounds.ws[0]) 
                   || (tree.ws[1] > bounds.en[1] || tree.center[0] > bounds.en[0])) {
                    return false;
                }
                
                return true;
    
            default:
                return false;
    
        }
    }


    return this;
})();

