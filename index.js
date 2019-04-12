var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var cors = require('cors');

var fileUpload = require('express-fileupload');
var jwt = require('jsonwebtoken');
var expressJwt = require('express-jwt');
var fs = require('fs');
var socketio = require('socket.io');

const SECRET = 'key67entgrp';

var app = express();

var Appointments = require('./models/appointments');
var Comments = require('./models/comments');
var Managers = require('./models/project_managers');
var Projects = require('./models/projects');
var Stages = require('./models/stages');

app.use(cors());
var server = app.listen(process.env.PORT || 6700, '0.0.0.0');
//var io = socketio.listen(server);

app.use(fileUpload({safeFileNames: true, preserveExtension: 4}));

// const RSA_PUBLIC_KEY = fs.readFileSync('keys/public.key');

const isAuthed = expressJwt({
    secret:SECRET
});


function filter(params, items){
    if(typeof items == 'string'){
        items = items.split(' ');
    }

    for(var i in params){
        if(!items.includes(i))
            delete params[i];
    }

    return params;
}

app.all('/', function(req, res){
    res.status(200).send({info: 'Server is up.' });
});

app.use(bodyParser.json());

//URL params;
app.param(['id'], (q,s,n) => n());

//Manager:Profile
app.get('/profile', isAuthed, (req, res) => {
    if(req.user && req.user._id){
        //TODO: Add Projects and Appointments
        Managers.findById(req.user._id).select('name surname email level biography cover image').populate('projects').populate('appointments').exec((err, profile) => {
            if(err)
                res.status(400).send(err);
            else
                res.status(200).send(profile);
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

//Manager:Edit
app.post('/profile/edit', isAuthed, (req, res) => {
    req.body = filter(req.body, 'name surname biography employment');
    
    if(req.user && req.user._id){
        if(req.files){
            if(req.files.cover){
                req.body.cover = 'cover_' + req.user._id + '.' + req.files.cover.name.split('.')[1];
                req.files.cover.mv('./images/' + req.body.cover, () => {});
            }
            if(req.files.image){
                req.body.image = 'avatar_' + req.user._id + '.' + req.files.image.name.split('.')[1];
                req.files.image.mv('./images/' + req.body.image, () => {});
            }
        }

        if(req.body.length){
            Managers.findByIdAndUpdate(req.user._id, req.body, { new: true }).select('name surname email level biography cover image').exec((err, profile) => {
                if(err)
                    res.status(400).send(err);
                else
                    res.status(200).send(profile);
            });
        }else{
            res.status(400).send('No changes made.');
        }
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

//Manager:Upgrade
app.post('/upgrade', isAuthed, (req, res) => {
    var level = Number(req.body.level) || 0;
    if(req.user && req.user._id){
        Managers.findByIdAndUpdate(req.user._id, { level }, { new: true }).select('-password').exec((err, upgraded) => {
            if(err || !upgraded)
                res.status(400).send(err || 'Failed to update Manager.');
            else{
                var expiresIn = Math.round(req.user.exp - (Number(new Date())/1000));
                const jwtBearerToken = jwt.sign({ _id: upgraded._id, level: upgraded.level, email: upgraded.email },SECRET,{
                    expiresIn
                });

                res.status(200).send({
                    token: jwtBearerToken,
                    email: upgraded.email
                }); 
            }
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
})

//Manager:Register
app.post('/register', (req, res) => {
    req.body = filter(req.body, 'email password name surname biography employment');
    
    var details = req.body;

    Managers.create(details, (err, manager) => {
        if(err)
            res.status(400).send(err);
        else{
            const jwtBearerToken = jwt.sign({ _id: manager._id, level: manager.level, email: manager.email }, SECRET,{
                expiresIn: '24h'
            });
    
            res.status(200).send({
                token: jwtBearerToken,
                email: manager.email
            }); 
        }
    });
});

//Manager:Login
app.post('/login', (req, res) => {
    req.body = filter(req.body, 'email password');
    
    var credentials = req.body;

    Managers.findOne(credentials).select('name surname email level biography').exec((err, manager) => {
        if(err)
            res.status(400).send(err);
        else
        {
            if(manager)
            {
                const jwtBearerToken = jwt.sign({ _id: manager._id, level: manager.level, email: manager.email },SECRET,{
                    expiresIn: '24h'
                });

                res.status(200).send({
                    token: jwtBearerToken,
                    email: manager.email
                }); 
            }
            else
            {
                res.status(400).send('Invalid email or password.');
            }
        }
    })
});

//Manager:Get X
app.get('/managers', (req, res) => {
    var limit = Number(req.query.limit) || 6;
    Managers.aggregate([
        {
            $project: {
                name: 1, cover: 1, image: 1, employment: 1
            }
        },
        {
            $limit: limit
        }
    ], (err, projects) => {
        if(err)
            res.status(400).send(err);
        else
            res.status(200).send(projects);
    });
});

//Manager: View
app.get('/managers/:id', (req, res) => {
    var param = req.params.id;
    if(!mongoose.Types.ObjectId.isValid(param)){
        res.status(400).send({ error: 1, message: 'Invalid ID'});
    }else{
        var managerId = mongoose.Types.ObjectId(req.params.id);
        Managers.aggregate([
            {
                $match: {
                    _id: managerId
                }
            },
            {
                $lookup: {
                    from: 'projects',
                    let: { mid: "$_id"},
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: [ "$manager", "$$mid"] },
                                public: true
                            }
                        },
                        {
                            $project: {
                                name: 1, locality: 1, description: 1, cover: 1, created: 1, year: { $dateToString: { format: "%Y", date: "$created" } }
                            }
                        }
                    ],
                    as: 'projects'
                }
            },
            {
                $project: {
                    __v: 0, password: 0
                }
            }
        ], (err, manager) => {
            if(err || !manager.length)
                res.status(400).send(err || 'Manager not found');
            else
                res.status(200).send(manager[0]);
        });
    }
});

//Project: Get 
// app.get('/projects/:id', (req, res) => {
//     var param = req.params.id;
//     if(!mongoose.Types.ObjectId.isValid(param)){
//         res.status(400).send({ error: 1, message: 'Invalid ID'});
//     }else{
//         Projects.findById(param, ())
//     }
// })

//Appointment: Add
app.post('/appointments/set', (req, res) => {
    req.body = filter(req.body, 'name surname email mobile description manager');

    if(Object.keys(req.body).length != 6){
        res.status(400).send({err: 1, message: 'Missing Parameters'});
    }
    else{
        Appointments.create(req.body, (err, appointment) => {
            if(err || !appointment)
                res.status(400).send(err || 'Failed to create appointment');
            else{
                res.status(200).send('Appointment set successfully.');
            }
        });
    }
});

//Appointment: Get User's
app.get('/appointments', isAuthed, (req, res) => {
    if(req.user && req.user._id){
        Appointments.find({ manager: req.user._id }).select('-manager -__v').exec((err, appointments) => {
            if(err)
                res.status(400).send(err);
            else
                res.status(200).send(appointments);
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
})

//TODO
//Project: Add, Edit
//Stage: Add, Edit, Delete

//Mongoose Connection
mongoose.connect('mongodb+srv://keyadmin:nf2CY6GtMgG4XTX@keydb-ju9o2.mongodb.net/keydb', { 
    reconnectTries: Number.MAX_VALUE,
    reconnectInterval: 1000,
    useNewUrlParser: true,
    useFindAndModify: false,
    useCreateIndex: true
}, err=>{
    if(!err){
        console.log('MongoDB Connection established.');
    }else{
        console.log('Failed to connect to MongoDB.');
        console.error(err);
    }
});

app.use(function (err, req, res, next) {
    if (err && err.name === 'UnauthorizedError') {
        console.log('Unauthorized.');
        console.error(err);
        res.status(401).send({ origin: req.originalUrl, code: 99, message: err.message });
    }
});