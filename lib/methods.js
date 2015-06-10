//var utils = require('./utils.js');

function methods(schema) {
    var QuadtreeModel = schema.statics.QuadtreeModel;

    // Query hist model for cur version
    schema.methods.currentVersion = function(callback) {
        var id = this._id;

        QuadtreeModel.findOne(
                {"_id": id }, 
                {currentVersion: 1, _id: 0}, 
                callback
        ); 
    }

    // Add this new model into the quad tree
    schema.methods.addElement = function(callback) {
        var id = this._id;
        var self = this;

        QuadtreeModel.findOne({"_id": id }, 
            { "data": { "$elemMatch": { "_version": version } } },   
            function(err, result) {
                if (err) { 
                    callback(err, null);
                    return;
                }

                callback(null, result);
            }
        );
    }
}


module.exports = methods;
