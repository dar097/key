var mongoose = require('mongoose');

var StageSchema = new mongoose.Schema({
    name: String,
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true
    },
    status: {
        type: Boolean,
        default: true
    },
    start_date: Date,
    end_date: Date,
    details: String,
    price: Number,
    files: [String]
});

module.exports = mongoose.model('Stage', StageSchema);