var mongoose = require('mongoose');

var AppointmentSchema = new mongoose.Schema({
    name: String,
    surname: String,
    email: String,
    manager: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Project_Manager',
        required: true
    },
    description: String,
    mobile: String,
    read: Boolean,
}, { timestamps: { createdAt: 'created', updatedAt: 'updated' }});

module.exports = mongoose.model('Appointment', AppointmentSchema);