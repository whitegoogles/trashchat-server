const express = require('express');
const path = require('path');
const moment = require('moment');
require('moment-duration-format');
const uuidv4 = require('uuid/v4');
const open = require('open');
const app = express();

const roomExpiration = 60*60*24*7;
var roomStates = {
	'started':'room-started',
	"closed":'room-closed',
	'waiting':'room-waiting',
	'running':'room-running',
	'full': 'room-full'
};

const cache = require('node-file-cache').create({life:roomExpiration});

const roomLife = 30;//60*15;
const reactPath = './build/index.html';
const messageLimit = 2000;
const nameLimit = 20;
const roomLimit = 36;
const chattersLimit = 3; //50

var allowCrossDomain = function(req, res, next) {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS');
    res.header('Access-Control-Allow-Headers', 'Origin,Content-Type, Authorization, Content-Length, X-Requested-With');
	next();
};

app.use(allowCrossDomain);

// Put all API endpoints under '/api'
app.get('/room', (req, res) => {
  var roomId = uuidv4();
  res.json({roomId});
});

app.use(express.static('build'));

// The "catchall" handler: for any request that doesn't
// match one above, send back React's index.html file.
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname,reactPath));
});

const port = process.env.PORT || 5000;
const server = app.listen(port,function(err){
	if(err){
		console.log("Couldn't open up the port");
		console.log(err);
	}
	else{
		open('http://localhost:'+port);
	}
});

const io = require('socket.io')(server);
io.on('connection',(socket)=>{
	function checkTimedOut(room){
		if((+new Date())/1000 > cache.get(room).timeout){
			io.sockets.in(room).emit('room-closed',{});
			return true;
		}
		return false;
	}
	function canUseRoom(room){
		return room.state === roomStates.running || room.state === roomStates.full;
	}
	
	socket.on('room-opened',(data)=>{
		if(data.room){
			data.room = data.room.substring(0,roomLimit);
			//Room just got started by this person
			if(!cache.get(data.room)){
				cache.set(data.room,{
					state:roomStates.started
				});
			}
			socket.join(data.room);
			var room = cache.get(data.room);
			var clients = io.sockets.adapter.rooms[data.room];
			
			//Reset back to a started room if a waiting person refreshes the page
			room.state = room.state === roomStates.waiting && clients === 1 ? roomStates.started : room.state;
			switch(room.state){
				case roomStates.started:
					room.state = roomStates.waiting;
					room.expiration = (+ new Date())/1000 + roomExpiration;
					room.messages = [];
					cache.set(data.room,room);
					socket.emit('room-started',{expiration:room.expiration});
					break;
				case roomStates.waiting:
					room.state = roomStates.running;
					room.expiration = -1;
					room.timeout = (+ new Date())/1000 + roomLife;
					cache.set(data.room,room);
					var timeLeft = room.timeout-(+new Date())/1000;
					io.sockets.in(data.room).emit('room-joined-at',{index:cache.get(data.room).messages.length,time:timeLeft});
					setTimeout(function(){
						io.sockets.in(data.room).emit('room-closed',{});
						room.state = roomStates.closed;
						cache.set(data.room,room);
					},roomLife*1000);
					var roomInterval = setInterval(function(){
						var timeLeft = cache.get(data.room).timeout-(+new Date())/1000;
						if(!checkTimedOut(data.room))
							io.sockets.in(data.room).emit('heartbeat',{time:timeLeft});
						else
							clearInterval(roomInterval);
					},30000);
					break;
				case roomStates.closed:
					socket.emit('room-closed',"");
					socket.disconnect();
					break;
				case roomStates.full:
					if(clients.length>chattersLimit) {
						socket.emit('room-full',"");
						socket.disconnect();
						break;
					}
				case roomStates.running: 	
					var timeLeft = room.timeout-(+new Date())/1000;
					room.state = roomStates.running; //Todo not sure about this and async stuff
					if(clients.length>=chattersLimit){
						room.state = roomStates.full;
					}
					cache.set(data.room,room);
					socket.emit('room-joined-at',{index:cache.get(data.room).messages.length,time:timeLeft});
					break;
			}
		}
	});
	socket.on('get-last-50-messages',(data)=>{
		if(data.room && cache.get(data.room)){
			data.room = data.room.substring(0,roomLimit);
			var messages = cache.get(data.room).messages;
			var room = cache.get(data.room);
			if(canUseRoom(room) && data.index && data.index>0 && data.index<=messages.length){
				var begin = data.index-50;
				begin = begin>=0 ? begin: 0;
				var lastMessages = messages.slice(begin,data.index);
				socket.emit('last-50-messages',{messages:lastMessages,index:begin});
			}
		}
	});
	socket.on('message-sent',(data)=>{
		if(data.room && cache.get(data.room)){
			data.room = data.room.substring(0,roomLimit);
			room = cache.get(data.room);
			if(canUseRoom(room) && data.message && data.name && data.id){
				var cleanedData = {
					message:(""+data.message).substring(0,messageLimit),
					name:(""+data.name).substring(0,nameLimit),
					room: data.room,
					time: (+new Date()),
					id:(""+data.id).substring(0,roomLimit)
				};
				room.messages.push(data);
				cache.set(data.room,room);
				io.sockets.in(data.room).emit('message-received',data);
			}
		}
	});
});

console.log(`Trashchat server listening on ${port}`);