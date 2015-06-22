var utils = require('./utils.js');
function methods(schema) {
    var QuadtreeModel = schema.statics.QuadtreeModel;

    // Placeholder method function
    schema.methods.placeholder = function(callback) {
        var id = this._id;

        QuadtreeModel.findOne(
                {"_id": id }, 
                callback
        ); 
    }
}


module.exports = methods;
