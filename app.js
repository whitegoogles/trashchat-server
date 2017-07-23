const express = require('express');
const path = require('path');
const uuidv4 = require('uuid/v4');
const open = require('open');
const app = express();
const cache = require('node-file-cache').create({life:60*60*24*7});

const roomLife = 60*15;
const reactPath = '../trashchat-client/public/index.html';
const messageLimit = 2000;
const nameLimit = 20;
const roomLimit = 36;

app.use(allowCrossDomain);

// Put all API endpoints under '/api'
app.get('/room', (req, res) => {
  var roomId = uuidv4();
  res.json({roomId});
});

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
			console.log("well lads we timed out");
			return true;
		}
		console.log("WE AREN'T TIMING OUT AGGGGGGGGGG");
		return false;
	}
	socket.on('room-opened',(data)=>{
		if(data.room){
			data.room = data.room.substring(0,roomLimit);
			if(!cache.get(data.room)){
				setTimeout(function(){
					io.sockets.in(data.room).emit('room-closed',{});
				},roomLife*1000);
				cache.set(data.room,{messages:[],timeout:(+new Date())/1000+roomLife});
			}
			console.log("opening the room");
			socket.join(data.room);
			socket.emit('room-joined-at',{index:cache.get(data.room).messages.length});
			checkTimedOut(data.room);
		}
	});
	socket.on('get-last-50-messages',(data)=>{
		console.log("getting last 50");
		if(data.room && cache.get(data.room)){
			console.log("found the room");
			data.room = data.room.substring(0,roomLimit);
			var messages = cache.get(data.room).messages;
			if(!checkTimedOut(data.room) && data.index && data.index>0 && data.index<=messages.length){
				console.log("ok not timed out or anthing");
				var begin = data.index-50;
				begin = begin>=0 ? begin: 0;
				var lastMessages = messages.slice(begin,data.index);
				socket.emit('last-50-messages',{messages:lastMessages,index:begin});
			}
		}
	});
	socket.on('message-sent',(data)=>{
		console.log("message sent");
		if(data.room && cache.get(data.room)){
			data.room = data.room.substring(0,roomLimit);
			if(!checkTimedOut(data.room) && data.message && data.name && data.id){
				var cleanedData = {
					message:(""+data.message).substring(0,messageLimit),
					name:(""+data.name).substring(0,nameLimit),
					room: data.room,
					time: (+new Date()),
					id:(""+data.id).substring(0,roomLimit)
				};
				cache.get(data.room).messages.push(data);
				io.sockets.in(data.room).emit('message-received',data);
			}
		}
	});
});

console.log(`Trashchat server listening on ${port}`);