const { fork } = require('child_process');

console.log('start master');
console.log(process.argv);

var ws_url = "wss://uk.airmash.online/ffa";
var max_running = 0;
var verbose = false;
var region = '';
var room = '';
var aircraft = '1';
var new_bot = 0;
var type = '';

for (let arg of process.argv){
	if (arg.indexOf('-max=') === 0)
		max_running = parseInt(arg.replace('-max=', ''));
	else if (arg == '-verbose')
		verbose = true;
	else if (arg.indexOf('-ws=') === 0)
		ws_url = arg.replace('-ws=', '');
	else if (arg.indexOf('-region=') === 0)
		region = arg.replace('-region=', '');
	else if (arg.indexOf('-room=') === 0)
		room = arg.replace('-room=', '');
	else if (arg.indexOf('-aircraft=') === 0)
		aircraft = arg.replace('-aircraft=', '');
	
	if (arg.indexOf('-type=') === 0){
		type = arg.replace('-type=', '');
	}
}

new_bot = max_running;
if (type == "spatiebot")
	new_bot = 0;

	
let allow_players = ['all'];
let last_cmd = '';
let flag = '';

function new_child(_aircraft=null, _new_bot=null){
	if (num_running >= max_running)
		return;
	
	if (!_aircraft){
		_aircraft = aircraft;
	}
	if (_new_bot === null && new_bot > 0){
		_new_bot = true;
		new_bot--;
	}

	let params = ['-region='+region, '-room='+room, '-aircraft='+_aircraft, '-ws='+ws_url];
	if (verbose)
		params.push('-verbose');
	if (_new_bot)
		params.push('-test');
	
	var child = fork(_new_bot ? './client' : './client_spatiebot', params);
	childs.push(child);
	num_running++;
	
	console.log('new_child (running: '+num_running+')');


		
	child.send({cmd:'----allow_get', allow_players});
	setTimeout(()=>{
		child.send({cmd:'----get_last_cmd', last_cmd, flag});
	}, 1000);

	let restart_flag = true;
	child.on('close', (code)=>{
		if (!restart_flag) return;
		num_running--;
		for (let i=0;i<childs.length; i++){
			let c = childs[i];
			if (c.pid == child.pid){
				childs.splice(i, 1);
				break;
			}
		}
		if (num_running != childs.length){
			console.log("can't happen");
			process.exit();
			return;
		}
		console.log('child close, restarting');
		new_child(_aircraft, _new_bot);
	});

	child.on('message', (m) => {
		if (m.cmd == '----switch'){
			_aircraft = m.aircraft;
			return;
		} else if (m.cmd == '----set_last_cmd'){
			last_cmd = m.line;
			return;
		} else if (m.cmd == '----set_flag'){
			flag = m.flag;
			return;
		} else if (m.cmd == '----allow_set'){
			allow_players.push(m.player_name);
			child.send({cmd:'----allow_get', allow_players});
			return;
		} else if (m.cmd == '----allow_get'){
			child.send({cmd:'----allow_get', allow_players});
			return;
		}
	
	});
}


var num_running = 0;
var childs = [];



function main(){
	new_child();
	setInterval(new_child, 3000);
}

main();


function close(){
	console.log('closing');
	for (let c of childs){
		c.kill();
	}
	process.exit();
}
process.once('SIGTERM', function (code) {
	console.log('SIGTERM received...');
	close();
});
process.once('SIGINT', function (code) {
	console.log('SIGINT received...');
	close();
});
