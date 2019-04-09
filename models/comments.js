var mongoose = require('mongoose');

var CommentSchema = new mongoose.Schema({
    name: String,
    project: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project',
        required: true
    },
    from: String,
    content: String,
    read: Boolean,
    files: [String]
}, { timestamps: { createdAt: 'created', updatedAt: 'updated' }});

module.exports = mongoose.model('Comment', CommentSchema);