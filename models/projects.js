var mongoose = require('mongoose');

var ClientSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String
}, { _id: false });

var ProjectSchema = new mongoose.Schema({
    name: String,
    locality: {
        type: String,
        required: true
    },
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project_Manager',
        required: true
    },
    description: String,
    client: ClientSchema,
    public: Boolean,
    cover: String
}, { timestamps: { createdAt: 'created', updatedAt: 'updated' } });

module.exports = mongoose.model('Project', ProjectSchema);