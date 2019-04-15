var mongoose = require('mongoose');

var ProjectManagerSchema = new mongoose.Schema({
    name: String,
    surname: String,
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true
    },
    password: {
        type: String,
        select: false
    },
    employment: String,
    biography: String,
    level: {
        type: Number,
        default: 0
    },
    cover: String,
    image: String
});

module.exports = mongoose.model('Project_Manager', ProjectManagerSchema);