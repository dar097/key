var mongoose = require('mongoose');

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
    client_name: String,
    client_email: String,
    client_password: String,
    public: Boolean,
    cover: String
}, { timestamps: { createdAt: 'created', updatedAt: 'updated' } });

module.exports = mongoose.model('Project', ProjectSchema);