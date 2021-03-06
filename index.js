var express = require('express');
var mongoose = require('mongoose');
var bodyParser = require('body-parser');
var cors = require('cors');

var fileUpload = require('express-fileupload');
var jwt = require('jsonwebtoken');
var expressJwt = require('express-jwt');
var cloudinary = require('cloudinary').v2;
var ppf = require('promise.prototype.finally');
ppf.shim();

cloudinary.config({ 
    cloud_name: 'dkd7exqrr', 
    api_key: '337826315523454', 
    api_secret: 'VMljDE5Y6hRSE5ER-IYtnZ35fPE' 
});

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

//app.use('/images', express.static('images'));

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
        var managerId = mongoose.Types.ObjectId(req.user._id);
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
                            $lookup: {
                                from: 'stages',
                                let: { pid: "$_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: { $eq: ["$$pid", "$project"]}
                                        }
                                    },
                                    {
                                        $project: {
                                            __v: 0
                                        }
                                    }
                                ],
                                as: 'stages'
                            }
                        },
                        {
                            $project: {
                                name: 1, locality: 1, description: 1, cover: 1, created: 1, year: { $dateToString: { format: "%Y", date: "$created" } }, stages: 1
                            }
                        }
                    ],
                    as: 'projects'
                }
            },
            {
                $lookup: {
                    from: 'appointments',
                    let: { mid: "$_id"},
                    pipeline: [
                        {
                            $match: {
                                $expr: { $eq: [ "$manager", "$$mid"] },
                            }
                        },
                        {
                            $project: {
                                manager: 0
                            }
                        }
                    ],
                    as: 'appointments'
                }
            },
            {
                $project: {
                    __v: 0, password: 0
                }
            }
        ], (err, manager) => {
            if(err || !manager || !manager.length)
                res.status(400).send(err || 'Manager not found');
            else
                res.status(200).send(manager[0]);
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

function UploadFile(req, file, cb){
    if(req.files && req.files[file]){
        cloudinary.uploader.upload_stream({resource_type: file.includes('image') || file == 'cover' ? 'image' : 'raw'},(err, result) => {
            if(result)
                req.body[file] = result.secure_url;
            else
                console.log(err);

            if(cb && typeof cb == 'function')
                cb();

        }).end(req.files[file].data);
    }
    else
    {
        if(cb && typeof cb == 'function')
            cb();
    }
}

function UploadManyFiles(req, files, current, cb){
    if(current == files.length){
        cb();
        return;
    }

    UploadFile(req, files[current], () => {
        UploadManyFiles(req, files, ++current, cb);
    });
}

//Manager:Edit
app.post('/profile/edit', isAuthed, (req, res) => {
    req.body = filter(req.body, 'name surname biography employment');
    
    if(req.user && req.user._id){
        UploadManyFiles(req, ['image', 'cover'], 0, () => {
            if(Object.keys(req.body).length){
                console.log(req.body);
                Managers.findByIdAndUpdate(req.user._id, req.body, { new: true }).select('name surname email level biography employment cover image').exec((err, profile) => {
                    if(err)
                        res.status(400).send(err);
                    else
                        res.status(200).send(profile);
                });
            }
            else{
                res.status(400).send({ error: "No changes made." });
            }
        });
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
});

//Manager:Register
app.post('/register', (req, res) => {
    req.body = filter(req.body, 'email password name surname biography employment');
    
    var details = req.body;
    details.email = details.email.toLowerCase();

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
    credentials.email = credentials.email.toLowerCase();

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
                res.status(400).send({ error: "Invalid email or password." });
            }
        }
    });
});

//Manager:Get X
app.get('/managers', (req, res) => {
    var limit = Number(req.query.limit) || 6;
    Managers.aggregate([
        {
            $project: {
                _id: 1, name: 1, surname: 1, cover: 1, image: 1, employment: 1
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
                            $lookup: {
                                from: 'stages',
                                let: { pid: "$_id" },
                                pipeline: [
                                    {
                                        $match: {
                                            $expr: { $eq: ["$$pid", "$project"]}
                                        }
                                    },
                                    {
                                        $project: {
                                            __v: 0
                                        }
                                    }
                                ],
                                as: 'stages'
                            }
                        },
                        {
                            $project: {
                                name: 1, locality: 1, description: 1, cover: 1, created: 1, year: { $dateToString: { format: "%Y", date: "$created" } }, stages: 1
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
                res.status(200).send({ message: 'Appointment set successfully.' });
            }
        });
    }
});

app.get('/appointments/:id', isAuthed, (req, res) => {
    if(!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)){
        res.status(400).send({ error: 'Bad Id'});
        return;
    }

    if(req.user && req.user._id){
        Appointments.findByIdAndUpdate({ _id: req.params.id }, { read: true }, { new: true }, (err, appointment) => {
            if(err || !appointment)
                res.status(400).send(err || 'Appointment not found.');
            else
                res.status(200).send(appointment);
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
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
});

app.post('/projects/create', isAuthed, (req, res) => {
    if(req.user && req.user._id){
        
        req.body = filter(req.body, 'name locality description client_name client_email client_password public');

        req.body.manager = req.user._id;

        UploadFile(req, "cover", () => {
            Projects.create(req.body, (err, project) => {
                if(err || !project)
                    res.status(400).send(err || 'Failed to create project');
                else{
                    res.status(200).send({ message: 'Project set successfully.', id: project._id });
                }
            });
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

app.post('/projects/:id/edit', isAuthed, (req, res) => {
    if(!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)){
        res.status(400).send({ error: 'Bad Id'});
        return;
    }

    if(req.user && req.user._id){
        req.body = filter(req.body, 'name locality description client_name client_email client_password public');

        UploadFile(req, "cover", () => {
            Projects.findByIdAndUpdate({ _id: req.params.id, manager: req.user._id }, req.body, { new: true }, (err, edited) => {
                if(err || !edited)
                    res.status(400).send(err || 'Project not found or does not exist.');
                else{
                    res.status(200).send({ message: 'Project modified successfully.' });
                }
            });
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

app.post('/projects/:id/delete', isAuthed, (req, res) => {
    if(!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)){
        res.status(400).send({ error: 'Bad Id'});
        return;
    }

    if(req.user && req.user._id){
        Projects.findByIdAndRemove(req.params.id, (err, removed) => {
            if(err)
                res.status(400).send(err || 'Project not found or does not exist.');
            else{
                res.status(200).send({ message: 'Project removed successfully.' });
            }
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

app.get('/projects/:id', (req, res) => {
    if(!req.params.id || !mongoose.Types.ObjectId.isValid(req.params.id)){
        res.status(400).send({ error: 'Bad Id'});
        return;
    }

    var manager = '000000000000000000000000';
    if(req.headers && req.headers.authorization){
        var token = req.headers.authorization.split(' ')[1];
        manager = jwt.decode(token)._id || '000000000000000000000000';
        
    }
    
    manager = mongoose.Types.ObjectId(manager);


    Projects.aggregate([
        {
            $match: {
                $or: [ { manager }, { public: true } ],
                _id: mongoose.Types.ObjectId(req.params.id)
            }
        },
        {
            $lookup: {
                from: 'project_managers',
                let: { mid: "$manager" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$$mid", "$_id"]}
                        }
                    },
                    {
                        $project: {
                            name: 1, surname: 1, employment: 1, image: 1
                        }
                    }
                ],
                as: 'manager'
            }
        },
        { $unwind: "$manager" },
        {
            $lookup: {
                from: 'stages',
                let: { pid: "$_id" },
                pipeline: [
                    {
                        $match: {
                            $expr: { $eq: ["$$pid", "$project"]}
                        }
                    },
                    {
                        $project: {
                            __v: 0
                        }
                    }
                ],
                as: 'stages'
            }
        },
        {
            $project: {
                name: 1, locality: 1, manager: 1, description: 1, cover: 1, created: 1, year: { $dateToString: { format: "%Y", date: "$created" } }, stages: 1, client_name: 1, client_email: 1, client_password: 1, public: 1
            }
        }
    ]).exec((err, project) => {
        if(err || !project || !project.length)
            res.status(400).send(err || 'Project not found or does not exist.');
        else{
            res.status(200).send(project[0]);
        }
    });
});

app.post('/stages/create', isAuthed, (req, res) => {
    if(req.user && req.user._id){
        
        req.body = filter(req.body, 'name project start_date end_date details price');

        UploadManyFiles(req, req.files ? Object.keys(req.files) : [], 0, () => {//if images, file parameter needs to contain the word 'image'
            Stages.create(req.body, (err, stage) => {
                if(err || !stage)
                    res.status(400).send(err || 'Failed to create stage');
                else{
                    res.status(200).send({ message: 'Stage set successfully.', id: stage._id });
                }
            });
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

app.post('/stages/:id/edit', isAuthed, (req, res) => {
    if(req.user && req.user._id){
        
        req.body = filter(req.body, 'name start_date end_date details price status');

        UploadManyFiles(req, req.files ? Object.keys(req.files) : [], 0, () => {//if images, file parameter needs to contain the word 'image'
            Stages.findByIdAndUpdate(req.params.id, req.body, { new: true }, (err, stage) => {
                if(err || !stage)
                    res.status(400).send(err || 'Failed to update stage');
                else{
                    res.status(200).send({ message: 'Stage updated successfully.' });
                }
            });
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

app.post('/stages/:id/delete', isAuthed, (req, res) => {
    if(req.user && req.user._id){
        Stages.findByIdAndRemove(req.params.id, (err, stage) => {
            if(err)
                res.status(400).send(err || 'Failed to remove stage');
            else{
                res.status(200).send({ message: 'Stage removed successfully.' });
            }
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

app.get('/stages/:id', isAuthed, (req, res) => {
    if(req.user && req.user._id){
        Stages.findById(req.params.id).select('-__v').exec((err, stage) => {
            if(err || !stage)
                res.status(400).send(err || 'Stage not found or does not exist.');
            else
                res.status(200).send(stage);
        });
    } else {
        res.status(400).send({ error: 'Auth Error' });
    }
});

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

// Projects.find({}, (e, r) => console.log(r));