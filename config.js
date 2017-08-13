//DO NOT EDIT THIS CONFIG FILE EDIT THE trashcat-client\config.js and then npm build to update this one
module.exports = {
	"roomStates": {
		'started':'room-started',
		"closed":'room-closed',
		'waiting':'room-waiting',
		'running':'room-running',
		'full': 'room-full'
	},
	"roomExpiration": 60*60*24*7,
	"roomLife": 60*15,
	"messageLimit": 2000,
	"nameLimit": 20,
	"chattersLimit": 50
}