const WebSocket = require('ws');
const { performance } = require('perf_hooks');
const { Worker, MessageChannel, MessagePort, isMainThread, parentPort } = require('worker_threads');


console.log('start client');
console.log(process.argv);

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

var ws_url = "wss://uk.airmash.online/ffa";
var _getInsult;
var _flag_html = {};
var FlagStatus = {};
var _nav_hub = null;
var aircraft_type = 1;//1 pre 2 gol 3 cop 4 tor 5 pro
var defend_base = false;
var log_enabled = false;
var _test = false;
var iso_flags = ['nl', 'be', 'de', 'fr', 'cz', 'fi', 'hu', 'lv', 'lt', 'md', 'pt', 'ro', 'rs', 'sk', 'ch', 'tr', 'ua', 'gb', 'al', 'at', 'ba', 'by', 'bg', 'hr', 'cy', 'dk', 'ee', 'gr', 'is', 'il', 'mk', 'no', 'pl', 'ru', 'si', 'es', 'se'];
var emotes = ['pepe', 'tf', 'lol', 'clap', 'bro', 'kappa', 'cry', 'rage'];
let target_name = null;
let follow_name = null;
let turret = false;
let target_coords = null;
let target_path = null;

var DEVELOPMENT = false;
var game = {
	playHost: "eu-s1",
	playPath: "ffa2",
	playRoom: "ffa",
	regionName: 'eu',
	
	myName: 'test',
	myFlag: 'xx',
	protocol: 5,

	state: null,
	screenX: 0,
	screenY: 0,
	halfScreenX:2000,
	halfScreenY: 2000,
	scale: 1.0,
};


for (let arg of process.argv){
	if (arg == '-verbose')
		log_enabled = true;
	else if (arg == '-test')
		_test = true;
	else if (arg.indexOf('-ws=') === 0)
		ws_url = arg.replace('-ws=', '');
	else if (arg.indexOf('-region=') === 0)
		game.regionName = arg.replace('-region=', '');
	else if (arg.indexOf('-room=') === 0)
		game.playPath = arg.replace('-room=', '');
	else if (arg.indexOf('-aircraft=') === 0)
		aircraft_type = parseInt(arg.replace('-aircraft=', ''));

	if (game.playPath.indexOf('ffa') === 0)
		game.playRoom = 'ffa';
	else if (game.playPath.indexOf('ctf') === 0)
		game.playRoom = 'ctf';
	
	if (game.regionName.indexOf('eu') === 0)
		game.playHost = 'eu-s1';
	else if (game.regionName.indexOf('asia') === 0)
		game.playHost = 'asia-s1';
	else if (game.regionName.indexOf('us') === 0)
		game.playHost = 'us-s1';
}



var playerKilled = null;
var playerImpacted = null;
var CTF_MatchStarted = null;
var CTF_MatchEnded = null;
var keyup = null;

var bot_started = false;
function startBot(){
	if (bot_started)
		return;
	bot_started = true;
	
	if (!_test){
		console.log('start bot');
		setTimeout(()=>{
			keyup({originalEvent:{key:"b"}});
		}, 2000);
	} else {
		setTimeout(()=>{
			
			Bot.start();

			setInterval(()=>{
				Network.sendSay(':'+(emotes[Math.floor(Math.random()*emotes.length)])+':');
			}, 60000);

		}, 2000);
	}
}

var _worker = new Worker('./worker.js');

function main(){
	var e = function(e) {
		e = 1;
		Tools.updateTime(e);
		//Tools.debugStartFrame(),
		if (game.state == Network.STATE.PLAYING) {
			//Input.update();
			Network.detectConnectivity();
			Players.update();
			Mobs.update();
			//Particles.update(),
			Games.update();
			//Sound.update()
		}
		//Graphics.update(),
		//t || Graphics.render(),
		//Tools.debugEndFrame()
	};
	var f = function() {
		var t = performance.now() - game.time;
		//t > 450 && !game.focus && e(t / 16.666, !0)
		e(t/30);
	};
	
	setInterval(e, 16.666);//16.666 = 60fps

	Games_start();
}

setImmediate(main);

function getRandomNumber(lower, upper) {
	return lower + Math.floor(Math.random() * (upper - lower));
}

function Games_start(){
	game.state = Network.STATE.CONNECTING;
	if (!_test){
		game.myName = ''+getRandomNumber(1,100);
		game.myFlag = iso_flags[getRandomNumber(0, iso_flags.length+1)];
	} else {
		game.myName = '0'+getRandomNumber(1,100);
		game.myFlag = "jolly";
	}
	//console.log('configuration:', game); 
	Network.setup();
}



process.on('message', (m) => {
	if (log_enabled) console.log('CHILD got message:', m);
	
	if (m.cmd == '----allow_get'){
		allow_players = m.allow_players;
		if (allow_players.indexOf('none') !== -1)
			allow_players = [];
	
	} else if (m.cmd == '----get_last_cmd'){
		last_cmd = m.last_cmd;
		ready = true;
		if (last_cmd){
			UI.addChatLine({name:god},last_cmd);
			last_cmd = '';
		}
		if (m.flag){
			setTimeout(()=>{UI.addChatLine({name:god}, '-flag '+m.flag);}, 50);
		}

	}
});

    
var Network = {};
var Tools = {};
var Players = {};
var Graphics = {};
var Input = {};
var Mobs = {};
var Games = {};
var Sound = {
	clearThruster: function(){},
	playerKill: function(){},
	playerImpact: function(){},
	playerRespawn: function(){},
	updateThruster: function(){},
	effectRepel: function(){},
	missileLaunch: function(){},
};
let kills = 0;
let deaths = 0;
let bot_upgrades = 0;
let leader_id = null;
let last_cmd_ts = null;
let last_cmd_ts_players = {};
let target_timer = null;
let allow_players = ['all'];
let last_cmd = [];
const god = '';
let ready = false;

var UI = {
	selectAircraft: function(e) {
        Network.sendCommand("respawn", e + "")
		aircraft_type = e;
    },
	killed: function(p){
		kills++;
		playerKilled(null, p);
	},
	killedBy: function(p){
		deaths++;
		playerKilled(null, Players.getMe());
	},
	scoreboardUpdate: function(data, rankings){
		//es.
		  //data:
		   //[ { id: 14212, score: 0, level: 0 },
			 //{ id: 14214, score: 0, level: 0 } ],
		  //rankings: [ { id: 14212, x: 0, y: 0 }, { id: 14214, x: 138, y: 102 } ] }
		
		function Tools_decodeMinimapCoords(e, t) {
			return new Vector(128 * e - 16384 + 64,Tools.clamp(128 * t - 16384, -8192, 8192) + 64)
		}

		if (data.length)
			leader_id = data[0].id;
	
		for (let r of rankings){
			let player = Players.get(r.id);
			if (!player)
				continue;
			if (r.x === 0 && r.y === 0){
				player.removedFromMap = true;
			} else {
				if (player.removedFromMap)
					player.removedFromMap = false;
				let lowrespos = Tools_decodeMinimapCoords(r.x, r.y);
				player.lowResPos.x = lowrespos.x;
				player.lowResPos.y = lowrespos.y;
			}
		}
	},
	changeMinimapTeam: function(){},
	addChatMessage: function(){},
	addChatLine: function(e, n, r){
		//const player_id = e.id;
		const player_name = e.name;
		const line = n;
		if (!ready)
			return;
		if (line.indexOf('-') === 0){
			
			if (_test && (line.indexOf('-target') === 0 || line.indexOf('-follow') === 0 || line.indexOf('-turret') === 0 || line.indexOf('-goto') === 0 || line.indexOf('-say') === 0 || line.indexOf('-flag') === 0 || line.indexOf('-allow') === 0 || line.indexOf('-switch') === 0)){
				//if (last_cmd_ts_players[player_name]){
					//let diff = new Date() - last_cmd_ts_players[player_name];
					//if (diff < 50000){
						//Network.sendChat(player_name + ", retry in "+Math.round((50000-diff)/1000)+" seconds");
						//return;
					//}
				//}
				//if (last_cmd_ts){
					//let diff = new Date() - last_cmd_ts;
					//if (diff < 30000){
						//Network.sendChat(player_name + ", retry in "+Math.round((30000-diff)/1000)+" seconds");
						//return;
					//}
				//}
				//last_cmd_ts = new Date();
				//last_cmd_ts_players[player_name] = last_cmd_ts;

				//target
				if ((player_name == god || allow_players.indexOf('all') !== -1 || allow_players.indexOf(player_name) !== -1) && line.indexOf('-target') === 0){
					let _target_name = line.substr(8);
					let ok = true;
					if (_target_name == 'auto')
						target_name = null;
					else if (_target_name == 'me')
						target_name = player_name;
					else if (_target_name == 'leader'){
						target_name = 'leader';
					} else
						target_name = _target_name;
						//ok = false;
					if (ok)
						Network.sendChat("new target: "+(target_name||'auto'));
					follow_name = null;
					turret = false;
					target_coords = null;
					target_path = null;
					process.send({ cmd: '----set_last_cmd', line:'' });

				//follow
				} else if ((player_name == god || allow_players.indexOf('all') !== -1 || allow_players.indexOf(player_name) !== -1) && line.indexOf('-follow') === 0){
					let _target_name = line.substr(8);
					let ok = true;
					if (_target_name == 'auto')
						follow_name = null;
					else if (_target_name == 'me')
						follow_name = player_name;
					else if (_target_name == 'leader'){
						follow_name = 'leader';
					} else
						follow_name = _target_name;
					if (ok)
						Network.sendChat("following: "+(follow_name||'auto'));
					target_name = follow_name;
					turret = false;
					target_coords = null;
					target_path = null;
					process.send({ cmd: '----set_last_cmd', line:'' });
				
				//switch
				} else if ((player_name == god || allow_players.indexOf('all') !== -1 || allow_players.indexOf(player_name) !== -1) && line.indexOf('-switch') === 0){
					let _type = line.substr(8);
					if (_type == 'predator' || _type == 'pred')
						_type = 1;
					else if (_type == 'goliath' || _type == 'goli')
						_type = 2;
					else if (_type == 'mohawk' || _type == 'heli' || _type == 'copter')
						_type = 3;
					else if (_type == 'tornado')
						_type = 4;
					else if (_type == 'random')
						_type = getRandomNumber(1, 4+1);
					else
						return;
					process.send({ cmd: '----switch', aircraft:_type });
					setTimeout(()=>{throw "switch cmd";}, 1000);
				
				//turret
				} else if (line.indexOf('-turret') === 0){
					target_name = null;
					follow_name = null;
					turret = true;
					target_coords = null;
					target_path = null;
					Network.sendChat("turret on");
					process.send({ cmd: '----set_last_cmd', line:'' });
				
				//turret off
				} else if (line.indexOf('-turret off') === 0){
					target_name = null;
					follow_name = null;
					turret = false;
					target_coords = null;
					target_path = null;
					Network.sendChat("turret off");
					process.send({ cmd: '----set_last_cmd', line:'' });

				//goto
				} else if ((player_name == god || allow_players.indexOf('all') !== -1 || allow_players.indexOf(player_name) !== -1) && line.indexOf('-goto') === 0){
					let place = line.substr(6);
					let _place = place;
					if (_place == 'europe')
						_place = {x:917, y:-2800};
					else if (_place == 'africa')
						_place = {x:1131, y:-361};
					else if (_place == 'atlantic')
						_place = {x:-2772, y:-1996};
					else if (_place == 'greenland')
						_place = {x:-2680, y:-7116};
					else
						_place = null;

					if (_place){
						target_coords = {pos:_place};
						target_path = null;
						target_name = null;
						follow_name = null;
						turret = false;
						Network.sendChat("going to "+place);
						process.send({ cmd: '----set_last_cmd', line:'' });
					}
				

				//allow
				} else if (player_name == god && line.indexOf('-allow') === 0){
					let s = line.substr(7);
					process.send({ cmd: '----allow_set', player_name:s }); 

				//say
				} else if (line.indexOf('-say') === 0){
					let s = line.substr(5);
					if (s == 'pepe' || s == 'tf' || s == 'lol' || s == 'clap' || s == 'bro' || s == 'kappa' || s == 'cry' || s == 'rage')
						Network.sendSay(':'+s+':');
					else
						Network.sendChat(s);

				//flag
				} else if (line.indexOf('-flag') === 0){
					let s = line.substr(6);
					Network.sendCommand("flag", s); 
					process.send({ cmd: '----set_flag', flag:s });
				}
				
				// target lasts for 5min
				if (false){
					if (target_timer){
						clearTimeout(target_timer);
						target_timer = null;
					}
					if (target_name){
						target_timer = setTimeout(()=>{
							target_name = null;
							follow_name = null;
							turret = false;
							target_coords = null;
							target_path = null;
							Network.sendChat("new target: "+(target_name||'auto'));
						}, 5*60*1000);
					}
				}
			}
		}
	},
	loggedIn: function(){},
	updateUpgrades: function(e, t, n){
		if (n != null){
			bot_upgrades = t;
			if (log_enabled) console.log('upgrades a:', bot_upgrades);
		}
	},
	newScore: function(e){
		bot_upgrades = e.upgrades;
		if (log_enabled) console.log('upgrades n:', bot_upgrades);
	},
	updateScore: function(){},
	updateStats: function(){},
	chatMuted: function(){},
	serverMessage: function(){},
	showCommandReply: function(){},
	popBigMsg: function(){},
	updateSound: function(){},
	escapeHTML: function(){},
	visibilityHUD: function(){},
	aircraftSelected: function(){},
	addPowerup: function(){},
	updateHUD: function(){},
	resetPowerups: function(){},
	showMessage: function(a,b,c){
		console.log(a, b);
	},
	showSpectator: function(){},
	hideSpectator: function(){},
    errorHandler: function(e) {
        switch (e.error) {
        case 1:
            UI.showMessage("alert", '<span class="info">DISCONNECTED</span>Packet flooding detected', 2e4),
            Network.receivedError(e.error);
            break;
        case 2:
            UI.showMessage("alert", '<span class="info">BANNED</span>Packet flooding detected', 2e4),
            Network.receivedError(e.error);
            break;
        case 3:
            UI.showMessage("alert", '<span class="info">BANNED</span>You have been globally banned', 2e4),
            Network.receivedError(e.error);
            break;
        case 4:
            Network.receivedError(e.error),
            Games.redirRoot();
            break;
        case 5:
            UI.showMessage("alert", '<span class="info">RESPAWN</span>Full health and 2 seconds of inactivity required', 3e3);
            break;
        case 6:
            UI.showMessage("alert", '<span class="info">DISCONNECTED</span>AFK for more than 10 minutes<br><span class="button" onclick="Network.reconnect()">RECONNECT</span>', 72e5),
            Network.receivedError(e.error);
            break;
        case 7:
            UI.showMessage("alert", '<span class="info">DISCONNECTED</span>You have been kicked out', 2e4),
            Network.receivedError(e.error);
            break;
        case 8:
            UI.showMessage("alert", '<span class="info">DISCONNECTED</span>Invalid login data', 2e4),
            Network.receivedError(e.error);
            break;
        case 9:
            UI.showMessage("alert", '<span class="info">DISCONNECTED</span>Incorrect protocol level<br>Please clear your browser cache and refresh', 2e4),
            Network.receivedError(e.error);
            break;
        case 10:
            UI.showMessage("alert", '<span class="info">BANNED</span>Account banned', 2e4),
            Network.receivedError(e.error);
            break;
        case 11:
            UI.showMessage("alert", '<span class="info">DISCONNECTED</span>Account already logged in<br><span class="button" onclick="Network.reconnect()">RECONNECT</span>', 2e4),
            Network.receivedError(e.error);
            break;
        case 12:
            UI.showMessage("alert", '<span class="info">RESPAWN</span>Cannot respawn or change aircraft in a Battle Royale game', 3e3);
            break;
        case 13:
            UI.showMessage("alert", '<span class="info">SPECTATE</span>Full health and 2 seconds of inactivity required', 3e3);
            break;
        case 20:
            UI.showMessage("information", '<span class="info">UPGRADE</span>Not enough upgrade points', 3e3);
            break;
        case 30:
            UI.addChatMessage("Chat throttled to prevent spamming");
            break;
        case 31:
            UI.showMessage("alert", '<span class="info">THROTTLED</span>Flag change too fast');
            break;
        case 100:
            UI.addChatMessage("Unknown command");
        }
    }
};


class Player {
    constructor(e, t) {
        this.id = e.id,
        this.status = e.status,
        this.level = null == e.level || 0 == e.level ? null : e.level,
        this.reel = 1 == e.reel,
        this.name = e.name,
        this.type = e.type,
        this.team = e.team,
        this.pos = new Vector(e.posX,e.posY),
        this.lowResPos = new Vector(e.posX,e.posY),
        this.speed = Vector.zero(),
        this.speedupgrade = 0,
        this.rot = e.rot,
        this.flag = e.flag,
        this.speedLength = 0,
        this.sprites = {},
        this.randomness = Tools.rand(0, 1e5),
        this.keystate = {},
        this.lastTick = 0,
        this.health = 1,
        this.energy = 1,
        this.healthRegen = 1,
        this.energyRegen = 1,
        this.boost = !1,
        this.strafe = !1,
        this.flagspeed = !1,
        this.stealthed = !1,
        this.alpha = 1,
        this.scale = 1,
        this.powerups = {
            shield: !1,
            rampage: !1
        },
        this.powerupsShown = {
            shield: !1,
            rampage: !1
        },
        this.powerupActive = !1,
        this.render = !0,
        this.hidden = !1,
        this.culled = !1,
        this.timedout = !1,
        this.reducedFactor = !1,
        this.lastPacket = game.timeNetwork,
        this.state = {
            thrustLevel: 0,
            thrustDir: 0,
            bubble: !1,
            bubbleProgress: 0,
            bubbleFade: 0,
            bubbleTime: 0,
            bubbleTextWidth: 0,
            hasBadge: !1,
            badge: 0,
            stealthLevel: 0,
            scaleLevel: 1,
            powerupAngle: 0,
            powerupFade: 0,
            powerupFadeState: 0,
            lastBounceSound: 0
        },
		this.setupGraphics(),
        0 == this.status ? (Tools.decodeUpgrades(this, e.upgrades),
        this.updatePowerups()) : (this.hidden = !0,
        this.me() && UI.visibilityHUD(!1)),
        this.reel ? (this._prevPos = null,
        this._offset = null) : this.visibilityUpdate(),
        (!t && this.render || this.me()) && (this.scale = 0,
        this.state.scaleLevel = 0),
        this.me() && (game.myType = e.type,
        UI.aircraftSelected(e.type))
    }
    setupGraphics(e) {
        var t = null;
        switch (this.me() && (t = {
            layer: "aircraftme"
        }),
        //this.sprites.powerup = Textures.init("powerupShield", {
            //visible: !1,
            //alpha: .75
        //}),
        //this.sprites.powerupCircle = Textures.init("powerupCircle", {
            //visible: !1,
            //alpha: .75
        //}),
        this.type) {
        case 1:
            this.state.baseScale = .25;
            this.state.nameplateDist = 60;
            //this.sprites.sprite = Textures.init("shipRaptor", t),
            //this.sprites.shadow = Textures.init("shipRaptorShadow", {
                //scale: this.state.baseScale * (2.4 / config.shadowScaling)
            //}),
            //this.sprites.thruster = Textures.init("shipRaptorThruster"),
            //this.sprites.thrusterGlow = Textures.init("thrusterGlowSmall"),
            //this.sprites.thrusterShadow = Textures.init("thrusterShadow");
            break;
        case 2:
            this.state.baseScale = .35;
            this.state.nameplateDist = 60;
            //this.sprites.sprite = Textures.init("shipSpirit", t),
            //this.sprites.shadow = Textures.init("shipSpiritShadow", {
                //scale: this.state.baseScale * (2.4 / config.shadowScaling)
            //}),
            //this.sprites.thruster1 = Textures.init("shipRaptorThruster"),
            //this.sprites.thruster2 = Textures.init("shipRaptorThruster"),
            //this.sprites.thruster1Glow = Textures.init("thrusterGlowSmall"),
            //this.sprites.thruster2Glow = Textures.init("thrusterGlowSmall"),
            //this.sprites.thruster1Shadow = Textures.init("thrusterShadow"),
            //this.sprites.thruster2Shadow = Textures.init("thrusterShadow");
            break;
        case 3:
            this.state.baseScale = .25;
            this.state.nameplateDist = 60;
            //this.sprites.sprite = Textures.init("shipComanche", t),
            //this.sprites.rotor = Textures.init("shipComancheRotor", t),
            //this.sprites.shadow = Textures.init("shipComancheShadow", {
                //scale: this.state.baseScale * (2.4 / config.shadowScaling)
            //}),
            //this.sprites.rotorShadow = Textures.init("shipComancheRotorShadow", {
                //scale: 2 * this.state.baseScale * (2.4 / config.shadowScaling)
            //});
            break;
        case 4:
            this.state.baseScale = .28;
            this.state.nameplateDist = 60;
            //this.sprites.sprite = Textures.init("shipTornado", t),
            //this.sprites.shadow = Textures.init("shipTornadoShadow", {
                //scale: this.state.baseScale * (2.4 / config.shadowScaling)
            //}),
            //this.sprites.thruster1 = Textures.init("shipRaptorThruster"),
            //this.sprites.thruster2 = Textures.init("shipRaptorThruster"),
            //this.sprites.thruster1Glow = Textures.init("thrusterGlowSmall"),
            //this.sprites.thruster2Glow = Textures.init("thrusterGlowSmall"),
            //this.sprites.thruster1Shadow = Textures.init("thrusterShadow"),
            //this.sprites.thruster2Shadow = Textures.init("thrusterShadow");
            break;
        case 5:
            this.state.baseScale = .28;
            this.state.nameplateDist = 60;
            //this.sprites.sprite = Textures.init("shipProwler", t),
            //this.sprites.shadow = Textures.init("shipProwlerShadow", {
                //scale: this.state.baseScale * (2.4 / config.shadowScaling)
            //}),
            //this.sprites.thruster1 = Textures.init("shipRaptorThruster"),
            //this.sprites.thruster2 = Textures.init("shipRaptorThruster"),
            //this.sprites.thruster1Glow = Textures.init("thrusterGlowSmall"),
            //this.sprites.thruster2Glow = Textures.init("thrusterGlowSmall"),
            //this.sprites.thruster1Shadow = Textures.init("thrusterShadow"),
            //this.sprites.thruster2Shadow = Textures.init("thrusterShadow")
        }
        //if (this.reel || e || (this.setupNameplate(),
        //this.setupChatBubbles(),
        //null != this.level && this.setupLevelPlate()),
        //config.debug.collisions) {
            //this.col = new PIXI.Graphics;
            //for (var n of config.ships[this.type].collisions)
                //this.col.beginFill(16777215, .2),
                //this.col.drawCircle(n[0], n[1], n[2]),
                //this.col.endFill();
            //game.graphics.layers.explosions.addChild(this.col)
        //}
    }
    reteam(e) {
        this.team = e,
        //this.sprites.name.style = new PIXI.TextStyle(this.nameplateTextStyle()),
        UI.changeMinimapTeam(this.id, this.team)
    }
    nameplateTextStyle() {
        if (2 == game.gameType)
            var e = 1 == this.team ? "#4076E2" : "#EA4242";
        else
            e = this.team == game.myTeam ? "#FFFFFF" : "#FFEC52";
        return {
            fontFamily: "MontserratWeb, Helvetica, sans-serif",
            fontSize: "33px",
            fill: e,
            dropShadow: !0,
            dropShadowBlur: 10,
            dropShadowDistance: 0,
            padding: 4
        }
    }
    setupNameplate() {
        //var e = "";
        //2 == game.gameType && (e = "  ■")
        //,this.sprites.name = new PIXI.Text(this.name + e,this.nameplateTextStyle()),
        //this.sprites.name.scale.set(.5, .5),
        //this.sprites.flag = Textures.sprite("flag_" + this.flag),
        //this.sprites.flag.scale.set(.4, .4),
        //this.sprites.flag.anchor.set(.5, .5),
        //this.sprites.badge = Textures.sprite("badge_gold"),
        //this.sprites.badge.scale.set(.3),
        //this.sprites.badge.visible = !1,
        //game.graphics.layers.playernames.addChild(this.sprites.badge),
        //game.graphics.layers.playernames.addChild(this.sprites.flag),
        //game.graphics.layers.playernames.addChild(this.sprites.name)
    }
    setupChatBubbles() {
        //this.sprites.bubble = new PIXI.Container,
        //this.sprites.bubbleLeft = Graphics.initSprite("chatbubbleleft", this.sprites.bubble, {
            //scale: .5
        //}),
        //this.sprites.bubbleRight = Graphics.initSprite("chatbubbleright", this.sprites.bubble, {
            //scale: .5
        //}),
        //this.sprites.bubbleCenter = Graphics.initSprite("chatbubblecenter", this.sprites.bubble, {
            //scale: .5
        //}),
        //this.sprites.bubblePoint = Graphics.initSprite("chatbubblepoint", this.sprites.bubble, {
            //scale: .5
        //}),
        //this.sprites.emote = Graphics.initSprite("emote_tf", this.sprites.bubble, {
            //scale: .6,
            //anchor: [.5, .5]
        //}),
        //this.sprites.bubbleText = new PIXI.Text("a",{
            //fontFamily: "MontserratWeb, Helvetica, sans-serif",
            //fontSize: "12px",
            //fill: "white"
        //}),
        //this.sprites.bubble.addChild(this.sprites.bubbleText),
        //this.sprites.bubble.visible = !1,
        //this.sprites.bubble.pivot.set(.5, 34),
        //game.graphics.layers.bubbles.addChild(this.sprites.bubble)
    }
    visibilityUpdate(e) {
        this.culled = !Graphics.inScreen(this.pos, 128);
        var t = !(this.hidden || this.culled || this.timedout);
        if (e || this.render != t) {
            //switch (this.sprites.sprite.visible = t,
            //this.sprites.shadow.visible = t,
            //this.sprites.flag.visible = t,
            //this.sprites.name.visible = t,
            //null != this.sprites.level && (this.sprites.level.visible = t,
            //this.sprites.levelBorder.visible = t),
            //this.sprites.badge.visible = this.state.hasBadge && t,
            //this.sprites.powerup.visible = this.powerupActive && t,
            //this.sprites.powerupCircle.visible = this.powerupActive && t,
            //this.type) {
            //case 1:
                //this.sprites.thruster.visible = t,
                //this.sprites.thrusterGlow.visible = t,
                //this.sprites.thrusterShadow.visible = t;
                //break;
            //case 2:
            //case 4:
            //case 5:
                //this.sprites.thruster1.visible = t,
                //this.sprites.thruster1Glow.visible = t,
                //this.sprites.thruster1Shadow.visible = t,
                //this.sprites.thruster2.visible = t,
                //this.sprites.thruster2Glow.visible = t,
                //this.sprites.thruster2Shadow.visible = t;
                //break;
            //case 3:
                //this.sprites.rotor.visible = t,
                //this.sprites.rotorShadow.visible = t
            //}
            this.render = t
            //,t || Sound.clearThruster(this.id)
        }
    }
    stealth(e) {
        this.lastPacket = game.timeNetwork,
        this.energy = e.energy,
        this.energyRegen = e.energyRegen,
        e.state ? (this.stealthed = !0,
        this.state.stealthLevel = 0,
        this.team != game.myTeam && (this.keystate.LEFT && delete this.keystate.LEFT,
        this.keystate.RIGHT && delete this.keystate.RIGHT)) : this.unstealth()
    }
    unstealth() {
        this.stealthed = !1,
        this.state.stealthLevel = 0,
        this.opacity(1)
    }
    opacity(e) {
        this.alpha = e
        //,this.sprites.sprite.alpha = e,
        //this.sprites.shadow.alpha = e,
        //this.sprites.flag.alpha = e,
        //this.sprites.name.alpha = e,
        //this.sprites.badge.alpha = e,
        //this.sprites.powerup.alpha = .75 * e,
        //this.sprites.powerupCircle.alpha = .75 * e,
        //null != this.sprites.level && (this.sprites.level.alpha = e,
        //this.sprites.levelBorder.alpha = .4 * e),
        //5 == this.type && (this.sprites.thruster1.alpha = e,
        //this.sprites.thruster1Glow.alpha = e,
        //this.sprites.thruster2.alpha = e,
        //this.sprites.thruster2Glow.alpha = e)
    }
    kill(e) {
        if (this.status = 1,
        this.keystate = {},
        this.pos.x = e.posX,
        this.pos.y = e.posY,
        this.speed = Vector.zero(),
        this.me() && UI.resetPowerups(),
        this.resetPowerups(),
        this.hidden = !0,
        this.visibilityUpdate(),
        this.stealthed && this.unstealth(),
        !this.culled && !0 !== e.spectate) {
            switch (this.type) {
            case 1:
                //Particles.explosion(this.pos.clone(), Tools.rand(1.5, 2), Tools.randInt(2, 3));
                break;
            case 2:
                //Particles.explosion(this.pos.clone(), Tools.rand(2, 2.5), Tools.randInt(4, 7));
                break;
            case 3:
            case 4:
            case 5:
                //Particles.explosion(this.pos.clone(), Tools.rand(1.5, 2), Tools.randInt(2, 3))
            }
            //Graphics.shakeCamera(this.pos, this.me() ? 20 : 10),
            //Sound.clearThruster(this.id),
            //Sound.playerKill(this)
        }
    }
    me() {
        return game.myID == this.id
    }
    destroy(e) {
        //var t = this.me() ? game.graphics.layers.aircraftme : game.graphics.layers.aircraft;
        //switch (t.removeChild(this.sprites.sprite),
        //game.graphics.layers.shadows.removeChild(this.sprites.shadow),
        //this.sprites.sprite.destroy(),
        //this.sprites.shadow.destroy(),
        //this.sprites.powerup.destroy(),
        //this.sprites.powerupCircle.destroy(),
        //this.type) {
        //case 1:
            //game.graphics.layers.thrusters.removeChild(this.sprites.thruster),
            //game.graphics.layers.thrusters.removeChild(this.sprites.thrusterGlow),
            //this.sprites.thruster.destroy(),
            //this.sprites.thrusterGlow.destroy(),
            //this.sprites.thrusterShadow.destroy();
            //break;
        //case 2:
        //case 4:
        //case 5:
            //game.graphics.layers.thrusters.removeChild(this.sprites.thruster1, this.sprites.thruster2),
            //game.graphics.layers.thrusters.removeChild(this.sprites.thruster1Glow, this.sprites.thruster2Glow),
            //this.sprites.thruster1.destroy(),
            //this.sprites.thruster2.destroy(),
            //this.sprites.thruster1Glow.destroy(),
            //this.sprites.thruster2Glow.destroy(),
            //this.sprites.thruster1Shadow.destroy(),
            //this.sprites.thruster2Shadow.destroy();
            //break;
        //case 3:
            //t.removeChild(this.sprites.rotor),
            //this.sprites.rotor.destroy(),
            //game.graphics.layers.shadows.removeChild(this.sprites.rotorShadow),
            //this.sprites.rotorShadow.destroy()
        //}
        //e && !this.reel && (game.graphics.layers.playernames.removeChild(this.sprites.badge, this.sprites.name, this.sprites.flag),
        //null != this.sprites.level && (game.graphics.layers.playernames.removeChild(this.sprites.level, this.sprites.levelBorder),
        //this.sprites.level.destroy(),
        //this.sprites.levelBorder.destroy()),
        //game.graphics.layers.bubbles.removeChild(this.sprites.bubble),
        //this.sprites.badge.destroy(),
        //this.sprites.name.destroy(),
        //this.sprites.flag.destroy(),
        //this.sprites.bubble.destroy({
            //children: !0
        //}))
    }
    sayBubble(e) {
        //this.state.bubbleTime = game.time,
        //this.state.bubbleFade = 0,
        //this.state.bubble || (this.state.bubble = !0,
        //this.state.bubbleProgress = 0,
        //this.sprites.bubble.visible = !0,
        //this.sprites.bubble.alpha = 0,
        //this.sprites.bubble.scale.set(0, 0)),
        //this.sprites.bubble.cacheAsBitmap = !1;
        //var t = UI.isEmote(e.text, !0);
        //if (t) {
            //this.sprites.bubbleText.visible = !1,
            //this.sprites.emote.texture = Textures.get("emote_" + t),
            //this.sprites.emote.visible = !0;
            //var n = 26;
            //this.sprites.emote.position.set(0, 0)
        //} else {
            //this.sprites.bubbleText.visible = !0,
            //this.sprites.emote.visible = !1,
            //this.sprites.bubbleText.text = e.text;
            //n = this.sprites.bubbleText.width;
            //this.sprites.bubbleText.position.set(-n / 2, -7)
        //}
        //this.sprites.bubbleLeft.position.set(-n / 2 - 16, -21),
        //this.sprites.bubbleRight.position.set(n / 2 + 8, -21),
        //this.sprites.bubbleCenter.position.set(-n / 2 - 9, -21),
        //this.sprites.bubbleCenter.scale.set(n / 82 + 18 / 82, .5),
        //this.sprites.bubblePoint.position.set(-9, 18),
        //this.sprites.bubble.cacheAsBitmap = !0,
        //this.state.bubbleTextWidth = n
    }
    networkKey(e, t) {
        this.lastPacket = game.timeNetwork,
        1 == this.status && this.revive(),
        null != t.posX && (this.reducedFactor = Tools.reducedFactor(),
        this.pos.x = t.posX,
        this.pos.y = t.posY,
        this.rot = t.rot,
        this.speed.x = t.speedX,
        this.speed.y = t.speedY);
        var n = this.stealthed;
        null != t.keystate && Tools.decodeKeystate(this, t.keystate),
        null != t.upgrades && (Tools.decodeUpgrades(this, t.upgrades),
        this.updatePowerups()),
        null != t.energy && (this.energy = t.energy,
        this.energyRegen = t.energyRegen),
        null != t.boost && (this.boost = t.boost),
        this.team != game.myTeam && (this.stealthed || n && !this.stealthed) && this.unstealth(),
        this.me() || !n || this.stealthed || this.unstealth(),
        t.c == Network.SERVERPACKET.EVENT_BOUNCE && game.time - this.state.lastBounceSound > 300 && (this.state.lastBounceSound = game.time,
        Sound.playerImpact(this.pos, this.type, this.speed.length() / config.ships[this.type].maxSpeed))
    }
    updateLevel(e) {
        this.me() && (1 == e.type && Games.showLevelUP(e.level),
        UI.updateMyLevel(e.level)),
        this.level = e.level,
        this.setupLevelPlate()
    }
    setupLevelPlate() {
        //null == this.sprites.level ? (this.sprites.level = new PIXI.Text(this.level + "",{
            //fontFamily: "MontserratWeb, Helvetica, sans-serif",
            //fontSize: "28px",
            //fill: "rgb(200, 200, 200)",
            //dropShadow: !0,
            //dropShadowBlur: 6,
            //dropShadowDistance: 0,
            //padding: 4
        //}),
        //this.sprites.level.scale.set(.5, .5),
        //this.sprites.levelBorder = Textures.sprite("levelborder"),
        //this.sprites.levelBorder.alpha = .4,
        //game.graphics.layers.playernames.addChild(this.sprites.levelBorder),
        //game.graphics.layers.playernames.addChild(this.sprites.level)) : this.sprites.level.text = this.level + "",
        //this.sprites.levelBorder.scale.set((this.sprites.level.width + 10) / 32, .65),
        //this.sprites.level.visible = this.render,
        //this.sprites.levelBorder.visible = this.render
    }
    powerup(e) {
        UI.addPowerup(e.type, e.duration)
    }
    resetPowerups() {
        //this.powerupActive && (this.sprites.powerup.visible = !1,
        //this.sprites.powerupCircle.visible = !1),
        this.powerups.shield = !1;
        this.powerupsShown.shield = !1;
        this.powerups.rampage = !1;
        this.powerupsShown.rampage = !1;
        this.powerupActive = !1;
        this.state.powerupFade = 0;
        this.state.powerupFadeState = 0;
    }
    updatePowerups() {
        var e = !1;
        this.powerups.shield != this.powerupsShown.shield && (this.powerupsShown.shield = this.powerups.shield,
        this.powerups.shield && (1/*this.sprites.powerup.texture = Textures.get("powerup_shield"),
        this.sprites.powerupCircle.tint = 16777215*/),
        e = !0),
        this.powerups.rampage != this.powerupsShown.rampage && (this.powerupsShown.rampage = this.powerups.rampage,
        //this.powerups.rampage && (this.sprites.powerup.texture = Textures.get("powerup_rampage"),
        //this.sprites.powerupCircle.tint = 16712448),
        e = !0),
        e && (this.powerupActive = this.powerups.shield || this.powerups.rampage,
        this.powerupActive ? (this.state.powerupFade = 0,
        this.state.powerupFadeState = 0
        /*,this.sprites.powerup.visible = !0,
        this.sprites.powerupCircle.visible = !0*/) : (this.powerupActive = !0,
        this.state.powerupFade = 0,
        this.state.powerupFadeState = 1))
    }
    impact(e, t, n, r) {
        this.health = n,
        this.healthRegen = r,
        this.stealthed && this.unstealth(),
        200 != e && Mobs.explosion(t, e),
        this.me() && 0 == this.status && Graphics.shakeCamera(t, 8)
    }
    changeType(e) {
        this.type != e.type && (this.destroy(!1),
        this.type = e.type,
        this.setupGraphics(!0),
        this.visibilityUpdate(!0))
    }
    respawn(e) {
        this.lastPacket = game.timeNetwork,
        this.status = 0,
        this.keystate = {},
        this.pos.x = e.posX,
        this.pos.y = e.posY,
        this.rot = e.rot,
        this.speed.x = 0,
        this.speed.y = 0,
        this.health = 1,
        this.energy = 1,
        this.healthRegen = 1,
        this.energyRegen = 1,
        this.boost = !1,
        this.strafe = !1,
        this.flagspeed = !1,
        this.state.thrustLevel = 0,
        this.state.thrustDir = 0,
        this.hidden = !1,
        this.timedout = !1,
        this.visibilityUpdate(),
        this.me() && UI.resetPowerups(),
        Tools.decodeUpgrades(this, e.upgrades),
        this.updatePowerups(),
        (this.render || this.me()) && (this.scale = 0,
        this.state.scaleLevel = 0),
        this.stealthed && this.unstealth(),
        this.me() && (game.myType = this.type,
        game.spectatingID = null,
        UI.aircraftSelected(this.type),
        UI.visibilityHUD(!0),
        UI.hideSpectator()),
        this.updateGraphics(1),
        Sound.playerRespawn(this);
		setTimeout(startBot, 1000);
    }
    revive() {
        this.status = 0,
        this.boost = !1,
        this.strafe = !1,
        this.flagspeed = !1,
        this.hidden = !1,
        this.health = 1,
        this.energy = 1,
        this.healthRegen = 1,
        this.energyRegen = 1,
        this.stealthed && this.unstealth()
    }
    changeFlag(e) {
        this.flag = e.flag
        //,this.sprites.flag.texture = Textures.get("flag_" + e.flag)
    }
    changeBadge(e) {
        //this.sprites.badge.texture = Textures.get(e)
    }
    updateNameplate() {
        if (!this.reel) {
            //var e = (this.sprites.name.width + this.sprites.flag.width + 10) / 2
              //, t = this.pos.x - e + (this.state.hasBadge ? 12 : 0) - (null != this.level ? this.sprites.level.width / 2 + 8 : 0)
              //, n = this.pos.y + this.state.nameplateDist * this.scale;
            //this.sprites.name.position.set(t + 40, n),
            //this.sprites.flag.position.set(t + 15, n + 10),
            //null != this.level && (this.sprites.level.position.set(t + 2 * e + 13, n + 2),
            //this.sprites.levelBorder.position.set(t + 2 * e + 7.75, n - .5))
			//,this.state.hasBadge && this.sprites.badge.position.set(t - 28, n)
        }
    }
    updateBubble() {
        this.state.bubbleProgress += .015 * game.timeFactor,
        this.state.bubbleProgress >= 1 && (this.state.bubbleProgress = 1),
        game.time - this.state.bubbleTime > 4e3 ? (this.state.bubbleFade += .08 * game.timeFactor,
        this.state.bubbleFade >= 1 && (this.state.bubbleFade = 1),
        //this.sprites.bubble.scale.set(1 + .2 * this.state.bubbleFade),
        //this.sprites.bubble.alpha = 1 * (1 - this.state.bubbleFade),
        this.state.bubbleFade >= 1 && (this.state.bubble = !1/*,
        this.sprites.bubble.visible = !1*/)) : (/*this.sprites.bubble.scale.set(Tools.easing.outElastic(this.state.bubbleProgress, .5)),*/
        this.sprites.bubble.alpha = 1);
        var e = (this.state.bubbleTextWidth + game.screenX) % 2 == 0 ? .5 : 0
          , t = game.screenY % 2 == 0 ? 0 : .5
          , n = this.state.nameplateDist * this.scale;
        this.powerupActive && (n += 60)
        //,this.sprites.bubble.position.set(this.pos.x * game.scale + e, (this.pos.y - n) * game.scale + t)
    }
    detectTimeout() {
        if (!this.me()) {
            var e = this.timedout;
            this.timedout = !game.lagging && game.timeNetwork - this.lastPacket > 3e3,
            this.timedout && !e && (this.boost = !1,
            this.strafe = !1,
            this.flagspeed = !1,
            this.speed = Vector.zero(),
            this.keystate = {},
            this.resetPowerups())
        }
    }
    leaveHorizon() {
        this.me() || this.timedout || (this.lastPacket = -1e4,
        this.timedout = !0,
        this.boost = !1,
        this.strafe = !1,
        this.flagspeed = !1,
        this.speed = Vector.zero(),
        this.keystate = {},
        this.resetPowerups())
    }
    update(e) {
		// e = game.timeFactor
        if (this.reel)
            this.clientCalcs(e);
        else {
            if (this.detectTimeout(),
            this.visibilityUpdate(),
            !this.render)
                return this.health += e * this.healthRegen,
                void (this.health >= 1 && (this.health = 1));
            if (!(!1 !== this.reducedFactor && (e -= this.reducedFactor,
            this.reducedFactor = !1,
            e <= 0))) {
                var t, n, r, i, o = e > .51 ? Math.round(e) : 1, s = e / o, a = 2 * Math.PI, l = this.boost ? 1.5 : 1;
                for (t = 0; t < o; t++) {
                    this.energy += s * this.energyRegen,
                    this.energy >= 1 && (this.energy = 1),
                    this.health += s * this.healthRegen,
                    this.health >= 1 && (this.health = 1),
                    i = -999,
                    this.strafe ? (this.keystate.LEFT && (i = this.rot - .5 * Math.PI),
                    this.keystate.RIGHT && (i = this.rot + .5 * Math.PI)) : (this.keystate.LEFT && (this.rot += -s * config.ships[this.type].turnFactor),
                    this.keystate.RIGHT && (this.rot += s * config.ships[this.type].turnFactor)),
                    n = this.speed.x,
                    r = this.speed.y,
                    this.keystate.UP ? -999 == i ? i = this.rot : i += Math.PI * (this.keystate.RIGHT ? -.25 : .25) : this.keystate.DOWN && (-999 == i ? i = this.rot + Math.PI : i += Math.PI * (this.keystate.RIGHT ? .25 : -.25)),
                    -999 !== i && (this.speed.x += Math.sin(i) * config.ships[this.type].accelFactor * s * l,
                    this.speed.y -= Math.cos(i) * config.ships[this.type].accelFactor * s * l);
                    var u = this.speed.length()
                      , c = config.ships[this.type].maxSpeed * l * config.upgrades.speed.factor[this.speedupgrade]
                      , h = config.ships[this.type].minSpeed;
                    this.powerups.rampage && (c *= .75),
                    this.flagspeed && (c = 5),
                    u > c ? this.speed.multiply(c / u) : this.speed.x > h || this.speed.x < -h || this.speed.y > h || this.speed.y < -h ? (this.speed.x *= 1 - config.ships[this.type].brakeFactor * s,
                    this.speed.y *= 1 - config.ships[this.type].brakeFactor * s) : (this.speed.x = 0,
                    this.speed.y = 0),
                    this.pos.x += s * n + .5 * (this.speed.x - n) * s * s,
                    this.pos.y += s * r + .5 * (this.speed.y - r) * s * s,
                    this.clientCalcs(s);
					//,this.name=='test'&&console.log("vvv", this.id, this.pos);
					//console.log("O", this.id, this.pos.x, this.speed.x);
                }
                this.rot = (this.rot % a + a) % a,
                -1 != game.gameType ? (this.pos.x < -16352 && (this.pos.x = -16352),
                this.pos.x > 16352 && (this.pos.x = 16352),
                this.pos.y < -8160 && (this.pos.y = -8160),
                this.pos.y > 8160 && (this.pos.y = 8160)) : (this.pos.x < -16384 && (this.pos.x += 32768),
                this.pos.x > 16384 && (this.pos.x -= 32768),
                this.pos.y < -8192 && (this.pos.y += 16384),
                this.pos.y > 8192 && (this.pos.y -= 16384))
				//,Sound.updateThruster(0, this)
            }
        }
    }
    clientCalcs(e) {
        switch (this.type) {
        case 1:
        case 2:
        case 4:
        case 5:
            var t = !1
              , n = !1
              , r = this.boost ? 1.5 : 1;
            !1 !== (t = this.keystate.LEFT ? .3 : this.keystate.RIGHT ? -.3 : 0) && (this.state.thrustDir = Tools.converge(this.state.thrustDir, t, .1 * e)),
            !1 !== (n = this.keystate.UP ? 1 : this.keystate.DOWN ? -1 : 0) && (this.state.thrustLevel = Tools.converge(this.state.thrustLevel, n * r, .2 * e));
            break;
        case 3:
            this.state.thrustDir += (.2 + this.speed.length() / 50) * e
        }
        this.culled || this.render && (!this.stealthed && this.health < .4 /*&& Particles.planeDamage(this)*/,
        !this.stealthed && this.health < .2 /*&& Particles.planeDamage(this)*/,
        this.boost /*&& Particles.planeBoost(this, n >= 0)*/,
        5 == this.type && this.stealthed && (this.state.stealthLevel += .03 * e,
        this.state.stealthLevel = Tools.clamp(this.state.stealthLevel, 0, this.team == game.myTeam ? .5 : 1),
        this.opacity(1 - this.state.stealthLevel)),
        this.state.scaleLevel += .005 * e,
        this.state.scaleLevel >= 1 ? (this.state.scaleLevel = 1,
        this.scale = 1) : this.scale = Tools.easing.outElastic(this.state.scaleLevel, .5),
        this.powerupActive && (this.state.powerupAngle += .075 * e,
        0 == this.state.powerupFadeState ? (this.state.powerupFade += .05 * e,
        this.state.powerupFade >= 1 && (this.state.powerupFade = 1)) : (this.state.powerupFade += .05 * e,
        this.state.powerupFade >= 1 && (this.powerupActive = !1
        /*,this.sprites.powerup.visible = !1,
        this.sprites.powerupCircle.visible = !1*/))))
    }
    updateGraphics(e) {
		
		return;

        var t = Tools.oscillator(.025, 1e3, this.randomness) * this.scale
          , n = 1.5 * this.state.thrustLevel
          , r = this.rot
          , i = Graphics.shadowCoords(this.pos);
        if (Graphics.transform(this.sprites.sprite, this.pos.x, this.pos.y, r, t * this.state.baseScale, t * this.state.baseScale),
        Graphics.transform(this.sprites.shadow, i.x, i.y, r, this.state.baseScale * (2.4 / config.shadowScaling) * this.scale, this.state.baseScale * (2.4 / config.shadowScaling) * this.scale),
        this.powerupActive) {
            var o = .35 * (0 == this.state.powerupFadeState ? 2 * (1 - this.state.powerupFade) + 1 : 1 - this.state.powerupFade) * Tools.oscillator(.075, 100, this.randomness)
              , s = .75 * (0 == this.state.powerupFadeState ? Tools.clamp(2 * this.state.powerupFade, 0, 1) : Tools.clamp(1 - 1.3 * this.state.powerupFade, 0, 1)) * this.alpha;
            Graphics.transform(this.sprites.powerup, this.pos.x, this.pos.y - 80, 0, o, o, s),
            Graphics.transform(this.sprites.powerupCircle, this.pos.x, this.pos.y - 80, this.state.powerupAngle, 1.35 * o, 1.35 * o, s)
        }
        var a = Tools.oscillator(.1, .5, this.randomness)
          , l = Math.abs(this.state.thrustLevel) < .01 ? 0 : this.state.thrustLevel / 2 + (this.state.thrustLevel > 0 ? .5 : -.5)
          , u = Tools.clamp(2 * Math.abs(this.state.thrustLevel) - .1, 0, 1);
        switch (this.type) {
        case 1:
            Graphics.transform(this.sprites.thruster, this.pos.x + Math.sin(-r) * (20 * t), this.pos.y + Math.cos(-r) * (20 * t), r + (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .3 * a * l * this.scale, .5 * a * l * this.scale, u),
            Graphics.transform(this.sprites.thrusterShadow, i.x + Math.sin(-r) * (20 * t) / config.shadowScaling, i.y + Math.cos(-r) * (20 * t) / config.shadowScaling, r + (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .4 * a * l * this.scale * (4 / config.shadowScaling), .5 * a * l * this.scale * (4 / config.shadowScaling), u / 2.5),
            Graphics.transform(this.sprites.thrusterGlow, this.pos.x + Math.sin(-r - .5 * this.state.thrustDir) * (40 * t), this.pos.y + Math.cos(-r - .5 * this.state.thrustDir) * (40 * t), null, 1.5 * n * this.scale, 1 * n * this.scale, .3 * this.state.thrustLevel);
            break;
        case 2:
            this.state.thrustLevel < 0 && (a *= .7),
            Graphics.transform(this.sprites.thruster1, this.pos.x + Math.sin(-r - .5) * (32 * t), this.pos.y + Math.cos(-r - .5) * (32 * t), r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .4 * a * l * this.scale, .6 * a * l * this.scale, u),
            Graphics.transform(this.sprites.thruster2, this.pos.x + Math.sin(.5 - r) * (32 * t), this.pos.y + Math.cos(.5 - r) * (32 * t), r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .4 * a * l * this.scale, .6 * a * l * this.scale, u),
            Graphics.transform(this.sprites.thruster1Shadow, i.x + Math.sin(-r - .5) * (32 * t) / config.shadowScaling, i.y + Math.cos(-r - .5) * (32 * t) / config.shadowScaling, r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .5 * a * l * this.scale * (4 / config.shadowScaling), .6 * a * l * this.scale * (4 / config.shadowScaling), u / 2.5),
            Graphics.transform(this.sprites.thruster2Shadow, i.x + Math.sin(.5 - r) * (32 * t) / config.shadowScaling, i.y + Math.cos(.5 - r) * (32 * t) / config.shadowScaling, r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .5 * a * l * this.scale * (4 / config.shadowScaling), .6 * a * l * this.scale * (4 / config.shadowScaling), u / 2.5),
            Graphics.transform(this.sprites.thruster1Glow, this.pos.x + Math.sin(-r - .3) * (50 * t), this.pos.y + Math.cos(-r - .3) * (50 * t), null, 2.5 * this.scale, 1.5 * this.scale, .3 * this.state.thrustLevel),
            Graphics.transform(this.sprites.thruster2Glow, this.pos.x + Math.sin(.3 - r) * (50 * t), this.pos.y + Math.cos(.3 - r) * (50 * t), null, 2.5 * this.scale, 1.5 * this.scale, .3 * this.state.thrustLevel);
            break;
        case 3:
            Graphics.transform(this.sprites.rotor, this.pos.x, this.pos.y, this.state.thrustDir, t * this.state.baseScale * 2, t * this.state.baseScale * 2, .8),
            Graphics.transform(this.sprites.rotorShadow, i.x, i.y, this.state.thrustDir, this.state.baseScale * (2.4 / config.shadowScaling) * this.scale * 2, this.state.baseScale * (2.4 / config.shadowScaling) * this.scale * 2);
            break;
        case 4:
            this.state.thrustLevel < 0 && (a *= .7),
            Graphics.transform(this.sprites.thruster1, this.pos.x + Math.sin(-r - .15) * (28 * t), this.pos.y + Math.cos(-r - .15) * (28 * t), r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .3 * a * l * this.scale, .5 * a * l * this.scale, u),
            Graphics.transform(this.sprites.thruster2, this.pos.x + Math.sin(.15 - r) * (28 * t), this.pos.y + Math.cos(.15 - r) * (28 * t), r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .3 * a * l * this.scale, .5 * a * l * this.scale, u),
            Graphics.transform(this.sprites.thruster1Shadow, i.x + Math.sin(-r - .15) * (28 * t) / config.shadowScaling, i.y + Math.cos(-r - .15) * (28 * t) / config.shadowScaling, r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .3 * a * l * this.scale * (4 / config.shadowScaling), .5 * a * l * this.scale * (4 / config.shadowScaling), u / 2.5),
            Graphics.transform(this.sprites.thruster2Shadow, i.x + Math.sin(.15 - r) * (28 * t) / config.shadowScaling, i.y + Math.cos(.15 - r) * (28 * t) / config.shadowScaling, r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .3 * a * l * this.scale * (4 / config.shadowScaling), .5 * a * l * this.scale * (4 / config.shadowScaling), u / 2.5),
            Graphics.transform(this.sprites.thruster1Glow, this.pos.x + Math.sin(-r - .2) * (45 * t), this.pos.y + Math.cos(-r - .2) * (45 * t), null, 2.5 * this.scale, 1.5 * this.scale, .25 * this.state.thrustLevel),
            Graphics.transform(this.sprites.thruster2Glow, this.pos.x + Math.sin(.2 - r) * (45 * t), this.pos.y + Math.cos(.2 - r) * (45 * t), null, 2.5 * this.scale, 1.5 * this.scale, .25 * this.state.thrustLevel);
            break;
        case 5:
            this.state.thrustLevel < 0 && (a *= .7),
            Graphics.transform(this.sprites.thruster1, this.pos.x + Math.sin(-r - .35) * (20 * t), this.pos.y + Math.cos(-r - .35) * (20 * t), r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .3 * a * l * this.scale, .4 * a * l * this.scale, u * this.alpha),
            Graphics.transform(this.sprites.thruster2, this.pos.x + Math.sin(.35 - r) * (20 * t), this.pos.y + Math.cos(.35 - r) * (20 * t), r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .3 * a * l * this.scale, .4 * a * l * this.scale, u * this.alpha),
            Graphics.transform(this.sprites.thruster1Shadow, i.x + Math.sin(-r - .35) * (20 * t) / config.shadowScaling, i.y + Math.cos(-r - .35) * (20 * t) / config.shadowScaling, r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .4 * a * l * this.scale * (4 / config.shadowScaling), .4 * a * l * this.scale * (4 / config.shadowScaling), u * this.alpha / 2.5),
            Graphics.transform(this.sprites.thruster2Shadow, i.x + Math.sin(.35 - r) * (20 * t) / config.shadowScaling, i.y + Math.cos(.35 - r) * (20 * t) / config.shadowScaling, r + .5 * (this.state.thrustLevel > 0 ? this.state.thrustDir : 0), .4 * a * l * this.scale * (4 / config.shadowScaling), .4 * a * l * this.scale * (4 / config.shadowScaling), u * this.alpha / 2.5),
            Graphics.transform(this.sprites.thruster1Glow, this.pos.x + Math.sin(-r - .2 - 0 * this.state.thrustDir) * (35 * t), this.pos.y + Math.cos(-r - .2 - 0 * this.state.thrustDir) * (35 * t), null, 2.5 * this.scale, 1.5 * this.scale, .2 * this.state.thrustLevel * this.alpha),
            Graphics.transform(this.sprites.thruster2Glow, this.pos.x + Math.sin(.2 - r - 0 * this.state.thrustDir) * (35 * t), this.pos.y + Math.cos(.2 - r - 0 * this.state.thrustDir) * (35 * t), null, 2.5 * this.scale, 1.5 * this.scale, .2 * this.state.thrustLevel * this.alpha)
        }
        this.updateNameplate(),
        this.state.bubble && this.updateBubble(),
        config.debug.collisions && this.col && (this.col.position.set(this.pos.x, this.pos.y),
        this.col.rotation = this.rot)
    }
}









// Network

(function() {
    var e = null
      , t = null
      , n = !1
      , r = ""
      , i = !1
      , o = null
      , s = -1
      , a = -1
      , l = 0
      , u = {}
      , c = 0
      , h = 0
      , d = 0
      , p = !1
      , f = 2e3
      , g = 2e3;
    Network.sendKey = function(e, r) {
        if (game.state == Network.STATE.PLAYING) {
            h++;
            var i = {
                c: P.KEY,
                seq: h,
                key: S[e],
                state: r
            };
            null != game.spectatingID && r && ("RIGHT" == e ? Network.spectatePrev() : "LEFT" == e && Network.spectateNext()),
            E(i),
            t && n && E(i, !0)
        }
    }
    ,
    Network.sendChat = function(e) {
        game.state == Network.STATE.PLAYING && E({
            c: P.CHAT,
            text: e
        })
    }
    ,
    Network.sendWhisper = function(e, t) {
        game.state == Network.STATE.PLAYING && E({
            c: P.WHISPER,
            id: e,
            text: t
        })
    }
    ,
    Network.sendSay = function(e) {
        game.state == Network.STATE.PLAYING && E({
            c: P.SAY,
            text: e
        })
    }
    ,
    Network.sendTeam = function(e) {
        game.state == Network.STATE.PLAYING && E({
            c: P.TEAMCHAT,
            text: e
        })
    }
    ,
    Network.sendCommand = function(e, t) {
        game.state == Network.STATE.PLAYING && ("flag" === e && (game.lastFlagSet = t),
        E({
            c: P.COMMAND,
            com: e,
            data: t
        }))
    }
    ,
    Network.voteMute = function(e) {
        game.state == Network.STATE.PLAYING && E({
            c: P.VOTEMUTE,
            id: e
        })
    }
    ,
    Network.force = function(e) {
        var t;
        Players.network(A.PLAYER_UPDATE, e);
        for (t in e.players)
            Players.network(A.PLAYER_UPDATE, e.players[t]);
        for (t in e.mobs)
            Mobs.network(e.mobs[t], e.id/**mod**/);
        var n = new Vector(e.posX,e.posY);
        //Particles.spiritShockwave(n),
        //Sound.effectRepel(n)
    }
    ,
    Network.getScores = function() {
        game.state == Network.STATE.PLAYING && E({
            c: P.SCOREDETAILED
        })
    }
    ,
    Network.resizeHorizon = function() {
        game.state == Network.STATE.PLAYING && E({
            c: P.HORIZON,
            horizonX: Math.ceil(game.halfScreenX / game.scale),
            horizonY: Math.ceil(game.halfScreenY / game.scale)
        })
    }
    ,
    Network.detectConnectivity = function() {
        game.lagging = game.timeNetwork - d > 1300
    }
    ,
    Network.shutdown = function() {
        null != o && clearInterval(o),
        null != e && e.close(),
        null != t && t.close(),
        n = !1,
        i = !1,
        s = -1,
        a = -1,
        l = 0,
        u = {},
        c = 0,
        h = 0,
        d = 0,
        p = !1,
        f = 2e3,
        g = 2e3
    }
    ,
    Network.receivedError = function(e) {
        p = e
    }
    ,
    Network.spectateNext = function() {
        game.state == Network.STATE.PLAYING && Network.sendCommand("spectate", "-1")
    }
    ,
    Network.spectatePrev = function() {
        game.state == Network.STATE.PLAYING && Network.sendCommand("spectate", "-2")
    }
    ,
    Network.spectateForce = function() {
        game.state == Network.STATE.PLAYING && (Players.amIAlive() ? Network.sendCommand("spectate", "-3") : Network.spectateNext())
    }
    ;
    var m = function() {
        game.lagging || game.state == Network.STATE.PLAYING && (i ? t && n && E({
            c: P.ACK
        }, !0) : E({
            c: P.ACK
        }),
        i = !i)
    }
      , v = function(e) {
        Math.abs(e - s) > 36e5 && (s = e,
        a = performance.now(),
        l = 0)
    }
      , y = function(e) {
		//console.log("NetworkA", e);
		//if (e.c === 12){
			//console.log("N", e.id, e.posX, e.speedX);
		//}
        if (game.state == Network.STATE.PLAYING || e.c == A.LOGIN || e.c == A.ERROR) {
            if ((e.c == A.PLAYER_UPDATE || e.c == A.PLAYER_FIRE || e.c == A.EVENT_BOOST || e.c == A.EVENT_BOUNCE) && e.id == game.myID || e.c == A.PING) {
                if (e.c != A.PING && _(e))
                    return;
                game.timeNetwork = performance.now(),
                d = game.timeNetwork,
                function(e) {
                    if (game.jitter = 0,
                    -1 != s) {
                        v(e);
                        var t = game.timeNetwork
                          , n = e - s - (t - a)
                          , r = n - (l = .8 * l + n / 5);
                        Math.abs(r) < 100 && (game.jitter = r)
                    }
                }(e.clock / 100)
            } else
                game.timeNetwork = performance.now(),
                d = game.timeNetwork,
                null != e.clock && function(e) {
                    -1 != s && (v(e),
                    game.jitter = e - s - (game.timeNetwork - a) - l)
                }(e.clock / 100);
            switch (e.c) {
            case A.PLAYER_UPDATE:
            case A.PLAYER_FIRE:
            case A.CHAT_SAY:
            case A.PLAYER_RESPAWN:
            case A.PLAYER_FLAG:
            case A.EVENT_BOOST:
            case A.EVENT_BOUNCE:
                if (Players.network(e.c, e),
                e.c === A.PLAYER_FIRE) {
                    for (var t = 0; t < e.projectiles.length; t++)
                        e.projectiles[t].c = A.PLAYER_FIRE,
                        Mobs.add(e.projectiles[t], false, e.id);//**mod
                    e.projectiles.length > 0 && Sound.missileLaunch(new Vector(e.projectiles[0].posX,e.projectiles[0].posY), e.projectiles[0].type)
                }
                break;
            case A.LOGIN:
				//console.log("A:LOGIN", e);
                !function(e) {
                    o = setInterval(m, 50),
                    game.myID = e.id,
                    game.myTeam = e.team,
                    game.myToken = e.token,
                    game.state = Network.STATE.PLAYING,
                    game.roomName = e.room,
                    game.gameType = e.type,
                    game.spectatingID = null,
                    game.myLevel = 0,
                    Games.prep(),
                    s = e.clock / 100,
                    a = performance.now()
					//,x()
                }(e),
                UI.loggedIn(e);
                for (t = 0; t < e.players.length; t++)
                    Players.add(e.players[t], !0);
                break;
            case A.ERROR:
                UI.errorHandler(e);
                break;
            case A.PLAYER_NEW:
                //console.log("PLAYER_NEW", e);/[>***
                Players.add(e);
                break;
            case A.PLAYER_LEAVE:
                Players.destroy(e.id);
                break;
            case A.PLAYER_TYPE:
                Players.changeType(e);
                break;
            case A.PLAYER_HIT:
                Players.impact(e),
                200 != e.type && Mobs.destroy(e);
                break;
            case A.PLAYER_KILL:
                Players.kill(e);
                break;
            case A.PLAYER_UPGRADE:
                UI.updateUpgrades([e.speed, e.defense, e.energy, e.missile], e.upgrades, e.type);
                break;
            case A.PLAYER_POWERUP:
                Players.powerup(e);
                break;
            case A.PLAYER_LEVEL:
                Players.updateLevel(e);
                break;
            case A.PLAYER_RETEAM:
                for (t = 0; t < e.players.length; t++)
                    Players.reteam(e.players[t]);
                break;
            case A.EVENT_REPEL:
                Network.force(e);
                break;
            case A.EVENT_LEAVEHORIZON:
                0 == e.type ? Players.leaveHorizon(e) : Mobs.destroy(e);
                break;
            case A.EVENT_STEALTH:
                Players.stealth(e);
                break;
            case A.MOB_UPDATE:
            case A.MOB_UPDATE_STATIONARY:
                Mobs.network(e);
                break;
            case A.MOB_DESPAWN:
                Mobs.despawn(e);
                break;
            case A.MOB_DESPAWN_COORDS:
                Mobs.destroy(e);
                break;
            case A.GAME_FLAG:
                Games.networkFlag(e);
                break;
            case A.GAME_PLAYERSALIVE:
                Games.playersAlive(e.players);
                break;
            case A.SCORE_UPDATE:
                UI.newScore(e);
                break;
            case A.SCORE_BOARD:
                UI.scoreboardUpdate(e.data, e.rankings, config.maxScoreboard),
                Players.updateBadges(e.data);
                break;
            case A.SCORE_DETAILED:
            case A.SCORE_DETAILED_CTF:
            case A.SCORE_DETAILED_BTR:
                UI.updateScore(e);
                break;
            case A.PING:
                !function(e) {
                    E({
                        c: P.PONG,
                        num: e
                    })
                }(e.num);
                break;
            case A.PING_RESULT:
                UI.updateStats(e);
                break;
            case A.CHAT_PUBLIC:
                if (config.mobile)
                    return;
                Players.chat(e);
                break;
            case A.CHAT_TEAM:
                if (config.mobile)
                    return;
                Players.teamChat(e);
                break;
            case A.CHAT_WHISPER:
                if (config.mobile)
                    return;
                Players.whisper(e);
                break;
            case A.CHAT_VOTEMUTEPASSED:
                if (config.mobile)
                    return;
                Players.votemutePass(e);
                break;
            case A.CHAT_VOTEMUTED:
                if (config.mobile)
                    return;
                return void UI.chatMuted();
            case A.SERVER_MESSAGE:
                console.log("SERVER_MESSAGE", e); //****
                UI.serverMessage(e);
                break;
            case A.SERVER_CUSTOM:
                b(e);
                break;
            case A.GAME_SPECTATE:
                Games.spectate(e.id);
                break;
            case A.GAME_FIREWALL:
                Games.handleFirewall(e);
                break;
            case A.COMMAND_REPLY:
                UI.showCommandReply(e)
            }
        }
    }
      , b = function(e) {
        try {
            var t = JSON.parse(e.data)
        } catch (e) {
            return
        }
        1 == e.type ? Games.showBTRWin(t) : 2 == e.type && Games.showCTFWin(t)
    }
      , _ = function(e) {
        var t = performance.now()
          , n = e.c + "_" + e.clock + "_" + e.posX + "_" + e.posY + "_" + e.rot + "_" + e.speedX + "_" + e.speedY;
        if (t - c > 15e3) {
            for (var r in u)
                t - u[r] > 3e4 && delete u[r];
            c = t
        }
        return null != u[n] || (u[n] = t,
        !1)
    };
    Network.reconnectMessage = function() {
        game.reloading || UI.showMessage("alert", '<span class="info">DISCONNECTED</span>Connection reset<br><span class="button" onclick="Network.reconnect()">RECONNECT</span>', 6e5)
    }
    ,
    Network.reconnect = function() {
        UI.showMessage("alert", "", 100),
        Games.switchGame()
    }
    ,
    Network.setup = function(retry=false) {
		var connected = false;
		var retrying = false;
        if (DEVELOPMENT) {
            r = -1 != document.domain.indexOf("192.168.") ? "ws://" + document.domain + ":8010/" + game.playPath : "ws://" + game.playHost + ".airmash.devel:8000/" + game.playPath
        } else {
			//r = "wss://game-" + game.playHost + ".airma.sh/" + game.playPath;
			//r = "wss://game.airmash.steamroller.tk/" + game.playPath;
			//r = "wss://uk.airmash.online/ffa";
			//r = 'ws://localhost:3501/';
			r = ws_url;
		}
		console.log(r);
        t && n && t.close(),
        (e = new WebSocket(r)).binaryType = "arraybuffer",
        e.onopen = function() {
			connected = true;
			retrying = false;
            console.log("Network e onopen");//****
            E({
                c: P.LOGIN,
                protocol: game.protocol,
                name: game.myName,
                session: config.settings.session ? config.settings.session : "none",
                horizonX: Math.ceil(game.halfScreenX / game.scale),
                horizonY: Math.ceil(game.halfScreenY / game.scale),
                flag: game.myFlag
            });
			if (aircraft_type != 1)
				setTimeout(()=>UI.selectAircraft(aircraft_type), 2500);
			else
				startBot();
        }
        ,
        e.onclose = function() {
			console.log('websocket onclose', connected);
			//if (!retrying)
				//throw "websocket onclose throw";
			setTimeout(()=>{
				throw "websocket onclose throw";
			}, 15000);
			return;
            null != o && clearInterval(o),
            game.state !== Network.STATE.CONNECTING && (game.state = Network.STATE.CONNECTING,
            !1 === p && Network.reconnectMessage())
        }
        ,
        e.onerror = function(e) {
			console.log('websocket onerror', connected);
			setTimeout(()=>{
				throw "retrying failed: throw";
			}, 15000);
			return;
			if (!connected){
				if (retry){
					setTimeout(()=>{
						throw "retrying failed: throw";
					}, 15000);
					return;
				}
				retrying = true;
				console.log('retrying');
				setTimeout(()=>Network.setup(game.regionName!='asia'), 0);
			}
		} ,
        e.onmessage = function(e) {
            y(T(e.data))
        }
    }
    ;
    var x = function() {
        (t = new WebSocket(r)).binaryType = "arraybuffer";
        t.onopen = function() {
            console.log("Network x onopen");//*****
            E({
                c: P.BACKUP,
                token: game.myToken
            }, !0)
        }
        ,
        t.onclose = function() {
            n = !1
        }
        ,
        t.onerror = function(e) {}
        ,
        t.onmessage = function(e) {
            var t = T(e.data);
            t.c === A.BACKUP && (n = !0),
            t.backup = !0,
            y(t)
        }
    }
      , w = function(e, t) {
        var n, r = 1, i = [], o = M[e.c];
        if (null == o)
            return null;
        for (n = 0; n < o.length; n++)
            switch (o[n][1]) {
            case I.text:
                var s = Tools.encodeUTF8(e[o[n][0]]);
                i.push(s),
                r += 1 + s.length;
                break;
            case I.array:
            case I.arraysmall:
                break;
            case I.uint8:
                r += 1;
                break;
            case I.uint16:
                r += 2;
                break;
            case I.uint32:
            case I.float32:
                r += 4;
                break;
            case I.float64:
                r += 8;
                break;
            case I.boolean:
                r += 1
            }
        var a = new ArrayBuffer(r)
          , l = new DataView(a)
          , u = 0
          , c = 1;
        for (l.setUint8(0, e.c, !0),
        n = 0; n < o.length; n++)
            switch (o[n][1]) {
            case I.text:
                var h = i[u].length;
                l.setUint8(c, h, !0),
                c += 1;
                for (var d = 0; d < h; d++)
                    l.setUint8(c + d, i[u][d], !0);
                i[u],
                u++,
                c += h;
                break;
            case I.array:
            case I.arraysmall:
                break;
            case I.uint8:
                l.setUint8(c, e[o[n][0]], !0),
                c += 1;
                break;
            case I.uint16:
                l.setUint16(c, e[o[n][0]], !0),
                c += 2;
                break;
            case I.uint32:
                l.setUint32(c, e[o[n][0]], !0),
                c += 4;
                break;
            case I.float32:
                l.setFloat32(c, e[o[n][0]], !0),
                c += 4;
                break;
            case I.float64:
                l.setFloat64(c, e[o[n][0]], !0),
                c += 8;
                break;
            case I.boolean:
                l.setUint8(c, !1 === e[o[n][0]] ? 0 : 1),
                c += 1
            }
        return a
    }
      , T = function(e, t) {
        var n = new DataView(e)
          , r = {
            c: n.getUint8(0, !0)
        }
          , i = 1
          , o = O[r.c];
        if (null == o)
            return null;
        for (var s = 0; s < o.length; s++) {
            var a = o[s][0];
            switch (o[s][1]) {
            case I.text:
            case I.textbig:
                if (o[s][1] == I.text) {
                    var l = n.getUint8(i, !0);
                    i += 1
                } else {
                    l = n.getUint16(i, !0);
                    i += 2
                }
                for (var u = new Uint8Array(l), c = 0; c < l; c++)
                    u[c] = n.getUint8(i + c, !0);
                var h = Tools.decodeUTF8(u);
                r[a] = h,
                i += l;
                break;
            case I.array:
            case I.arraysmall:
                if (o[s][1] == I.arraysmall) {
                    var d = n.getUint8(i, !0);
                    i += 1
                } else {
                    d = n.getUint16(i, !0);
                    i += 2
                }
                r[a] = [];
                for (var p = o[s][2], f = 0; f < d; f++) {
                    for (var g = {}, m = 0; m < p.length; m++) {
                        var v = p[m][0];
                        switch (p[m][1]) {
                        case I.text:
                        case I.textbig:
                            if (p[m][1] == I.text) {
                                l = n.getUint8(i, !0);
                                i += 1
                            } else {
                                l = n.getUint16(i, !0);
                                i += 2
                            }
                            for (u = new Uint8Array(l),
                            c = 0; c < l; c++)
                                u[c] = n.getUint8(i + c, !0);
                            h = Tools.decodeUTF8(u);
                            g[v] = h,
                            i += l;
                            break;
                        case I.uint8:
                            g[v] = n.getUint8(i, !0),
                            i += 1;
                            break;
                        case I.uint16:
                            g[v] = n.getUint16(i, !0),
                            i += 2;
                            break;
                        case I.uint24:
                            var y = 256 * n.getUint16(i, !0);
                            i += 2,
                            r[v] = y + n.getUint8(i, !0),
                            i += 1;
                            break;
                        case I.uint32:
                            g[v] = n.getUint32(i, !0),
                            i += 4;
                            break;
                        case I.float32:
                            g[v] = n.getFloat32(i, !0),
                            i += 4;
                            break;
                        case I.float64:
                            g[v] = n.getFloat64(i, !0),
                            i += 8;
                            break;
                        case I.boolean:
                            g[v] = 0 != n.getUint8(i, !0),
                            i += 1;
                            break;
                        case I.speed:
                            g[v] = Tools.decodeSpeed(n.getUint16(i, !0)),
                            i += 2;
                            break;
                        case I.accel:
                            g[v] = Tools.decodeAccel(n.getUint16(i, !0)),
                            i += 2;
                            break;
                        case I.coordx:
                            g[v] = Tools.decodeCoordX(n.getUint16(i, !0)),
                            i += 2;
                            break;
                        case I.coordy:
                            g[v] = Tools.decodeCoordY(n.getUint16(i, !0)),
                            i += 2;
                            break;
                        case I.coord24:
                            y = 256 * n.getUint16(i, !0);
                            i += 2,
                            r[v] = Tools.decodeCoord24(y + n.getUint8(i, !0)),
                            i += 1;
                            break;
                        case I.rotation:
                            g[v] = Tools.decodeRotation(n.getUint16(i, !0)),
                            i += 2;
                            break;
                        case I.regen:
                            g[v] = Tools.decodeRegen(n.getUint16(i, !0)),
                            i += 2;
                            break;
                        case I.healthnergy:
                            g[v] = Tools.decodeHealthnergy(n.getUint8(i, !0)),
                            i += 1
                        }
                    }
                    r[a].push(g)
                }
                break;
            case I.uint8:
                r[a] = n.getUint8(i, !0),
                i += 1;
                break;
            case I.uint16:
                r[a] = n.getUint16(i, !0),
                i += 2;
                break;
            case I.uint24:
                y = 256 * n.getUint16(i, !0);
                i += 2,
                r[a] = y + n.getUint8(i, !0),
                i += 1;
                break;
            case I.uint32:
                r[a] = n.getUint32(i, !0),
                i += 4;
                break;
            case I.float32:
                r[a] = n.getFloat32(i, !0),
                i += 4;
                break;
            case I.float64:
                r[a] = n.getFloat64(i, !0),
                i += 8;
                break;
            case I.boolean:
                r[a] = 0 != n.getUint8(i, !0),
                i += 1;
                break;
            case I.speed:
                r[a] = Tools.decodeSpeed(n.getUint16(i, !0)),
                i += 2;
                break;
            case I.accel:
                r[a] = Tools.decodeAccel(n.getUint16(i, !0)),
                i += 2;
                break;
            case I.coordx:
                r[a] = Tools.decodeCoordX(n.getUint16(i, !0)),
                i += 2;
                break;
            case I.coordy:
                r[a] = Tools.decodeCoordY(n.getUint16(i, !0)),
                i += 2;
                break;
            case I.coord24:
                y = 256 * n.getUint16(i, !0);
                i += 2,
                r[a] = Tools.decodeCoord24(y + n.getUint8(i, !0)),
                i += 1;
                break;
            case I.rotation:
                r[a] = Tools.decodeRotation(n.getUint16(i, !0)),
                i += 2;
                break;
            case I.regen:
                r[a] = Tools.decodeRegen(n.getUint16(i, !0)),
                i += 2;
                break;
            case I.healthnergy:
                r[a] = Tools.decodeHealthnergy(n.getUint8(i, !0)),
                i += 1;
                break;
            default:
                return null
            }
        }
        return r
    }
      , E = function(n, r) {
        r ? t.send(w(n)) : e.send(w(n))
    }
      , S = {
        UP: 1,
        DOWN: 2,
        LEFT: 3,
        RIGHT: 4,
        FIRE: 5,
        SPECIAL: 6
    }
      , I = {
        text: 1,
        textbig: 2,
        array: 3,
        arraysmall: 4,
        uint8: 5,
        uint16: 6,
        uint24: 7,
        uint32: 8,
        float32: 9,
        float64: 10,
        boolean: 11,
        speed: 12,
        accel: 13,
        coordx: 14,
        coordy: 15,
        coord24: 16,
        rotation: 17,
        healthnergy: 18,
        regen: 19
    }
      , P = {
        LOGIN: 0,
        BACKUP: 1,
        HORIZON: 2,
        ACK: 5,
        PONG: 6,
        KEY: 10,
        COMMAND: 11,
        SCOREDETAILED: 12,
        CHAT: 20,
        WHISPER: 21,
        SAY: 22,
        TEAMCHAT: 23,
        VOTEMUTE: 24,
        LOCALPING: 255
    }
      , M = {
        [P.LOGIN]: [["protocol", I.uint8], ["name", I.text], ["session", I.text], ["horizonX", I.uint16], ["horizonY", I.uint16], ["flag", I.text]],
        [P.BACKUP]: [["token", I.text]],
        [P.HORIZON]: [["horizonX", I.uint16], ["horizonY", I.uint16]],
        [P.ACK]: [],
        [P.PONG]: [["num", I.uint32]],
        [P.KEY]: [["seq", I.uint32], ["key", I.uint8], ["state", I.boolean]],
        [P.COMMAND]: [["com", I.text], ["data", I.text]],
        [P.SCOREDETAILED]: [],
        [P.CHAT]: [["text", I.text]],
        [P.WHISPER]: [["id", I.uint16], ["text", I.text]],
        [P.SAY]: [["text", I.text]],
        [P.TEAMCHAT]: [["text", I.text]],
        [P.VOTEMUTE]: [["id", I.uint16]],
        [P.LOCALPING]: [["auth", I.uint32]]
    }
      , A = {
        LOGIN: 0,
        BACKUP: 1,
        PING: 5,
        PING_RESULT: 6,
        ACK: 7,
        ERROR: 8,
        COMMAND_REPLY: 9,
        PLAYER_NEW: 10,
        PLAYER_LEAVE: 11,
        PLAYER_UPDATE: 12,
        PLAYER_FIRE: 13,
        PLAYER_HIT: 14,
        PLAYER_RESPAWN: 15,
        PLAYER_FLAG: 16,
        PLAYER_KILL: 17,
        PLAYER_UPGRADE: 18,
        PLAYER_TYPE: 19,
        PLAYER_POWERUP: 20,
        PLAYER_LEVEL: 21,
        PLAYER_RETEAM: 22,
        GAME_FLAG: 30,
        GAME_SPECTATE: 31,
        GAME_PLAYERSALIVE: 32,
        GAME_FIREWALL: 33,
        EVENT_REPEL: 40,
        EVENT_BOOST: 41,
        EVENT_BOUNCE: 42,
        EVENT_STEALTH: 43,
        EVENT_LEAVEHORIZON: 44,
        MOB_UPDATE: 60,
        MOB_UPDATE_STATIONARY: 61,
        MOB_DESPAWN: 62,
        MOB_DESPAWN_COORDS: 63,
        CHAT_PUBLIC: 70,
        CHAT_TEAM: 71,
        CHAT_SAY: 72,
        CHAT_WHISPER: 73,
        CHAT_VOTEMUTEPASSED: 78,
        CHAT_VOTEMUTED: 79,
        SCORE_UPDATE: 80,
        SCORE_BOARD: 81,
        SCORE_DETAILED: 82,
        SCORE_DETAILED_CTF: 83,
        SCORE_DETAILED_BTR: 84,
        SERVER_MESSAGE: 90,
        SERVER_CUSTOM: 91
    }
      , O = {
        [A.LOGIN]: [["success", I.boolean], ["id", I.uint16], ["team", I.uint16], ["clock", I.uint32], ["token", I.text], ["type", I.uint8], ["room", I.text], ["players", I.array, [["id", I.uint16], ["status", I.uint8], ["level", I.uint8], ["name", I.text], ["type", I.uint8], ["team", I.uint16], ["posX", I.coordx], ["posY", I.coordy], ["rot", I.rotation], ["flag", I.uint16], ["upgrades", I.uint8]]]],
        [A.BACKUP]: [],
        [A.PING]: [["clock", I.uint32], ["num", I.uint32]],
        [A.PING_RESULT]: [["ping", I.uint16], ["playerstotal", I.uint32], ["playersgame", I.uint32]],
        [A.ACK]: [],
        [A.ERROR]: [["error", I.uint8]],
        [A.COMMAND_REPLY]: [["type", I.uint8], ["text", I.textbig]],
        [A.PLAYER_NEW]: [["id", I.uint16], ["status", I.uint8], ["name", I.text], ["type", I.uint8], ["team", I.uint16], ["posX", I.coordx], ["posY", I.coordy], ["rot", I.rotation], ["flag", I.uint16], ["upgrades", I.uint8]],
        [A.PLAYER_LEAVE]: [["id", I.uint16]],
        [A.PLAYER_UPDATE]: [["clock", I.uint32], ["id", I.uint16], ["keystate", I.uint8], ["upgrades", I.uint8], ["posX", I.coord24], ["posY", I.coord24], ["rot", I.rotation], ["speedX", I.speed], ["speedY", I.speed]],
        [A.PLAYER_FIRE]: [["clock", I.uint32], ["id", I.uint16], ["energy", I.healthnergy], ["energyRegen", I.regen], ["projectiles", I.arraysmall, [["id", I.uint16], ["type", I.uint8], ["posX", I.coordx], ["posY", I.coordy], ["speedX", I.speed], ["speedY", I.speed], ["accelX", I.accel], ["accelY", I.accel], ["maxSpeed", I.speed]]]],
        [A.PLAYER_SAY]: [["id", I.uint16], ["text", I.text]],
        [A.PLAYER_RESPAWN]: [["id", I.uint16], ["posX", I.coord24], ["posY", I.coord24], ["rot", I.rotation], ["upgrades", I.uint8]],
        [A.PLAYER_FLAG]: [["id", I.uint16], ["flag", I.uint16]],
        [A.PLAYER_HIT]: [["id", I.uint16], ["type", I.uint8], ["posX", I.coordx], ["posY", I.coordy], ["owner", I.uint16], ["players", I.arraysmall, [["id", I.uint16], ["health", I.healthnergy], ["healthRegen", I.regen]]]],
        [A.PLAYER_KILL]: [["id", I.uint16], ["killer", I.uint16], ["posX", I.coordx], ["posY", I.coordy]],
        [A.PLAYER_UPGRADE]: [["upgrades", I.uint16], ["type", I.uint8], ["speed", I.uint8], ["defense", I.uint8], ["energy", I.uint8], ["missile", I.uint8]],
        [A.PLAYER_TYPE]: [["id", I.uint16], ["type", I.uint8]],
        [A.PLAYER_POWERUP]: [["type", I.uint8], ["duration", I.uint32]],
        [A.PLAYER_LEVEL]: [["id", I.uint16], ["type", I.uint8], ["level", I.uint8]],
        [A.PLAYER_RETEAM]: [["players", I.array, [["id", I.uint16], ["team", I.uint16]]]],
        [A.GAME_FLAG]: [["type", I.uint8], ["flag", I.uint8], ["id", I.uint16], ["posX", I.coord24], ["posY", I.coord24], ["blueteam", I.uint8], ["redteam", I.uint8]],
        [A.GAME_SPECTATE]: [["id", I.uint16]],
        [A.GAME_PLAYERSALIVE]: [["players", I.uint16]],
        [A.GAME_FIREWALL]: [["type", I.uint8], ["status", I.uint8], ["posX", I.coordx], ["posY", I.coordy], ["radius", I.float32], ["speed", I.float32]],
        [A.EVENT_REPEL]: [["clock", I.uint32], ["id", I.uint16], ["posX", I.coordx], ["posY", I.coordy], ["rot", I.rotation], ["speedX", I.speed], ["speedY", I.speed], ["energy", I.healthnergy], ["energyRegen", I.regen], ["players", I.arraysmall, [["id", I.uint16], ["keystate", I.uint8], ["posX", I.coordx], ["posY", I.coordy], ["rot", I.rotation], ["speedX", I.speed], ["speedY", I.speed], ["energy", I.healthnergy], ["energyRegen", I.regen], ["playerHealth", I.healthnergy], ["playerHealthRegen", I.regen]]], ["mobs", I.arraysmall, [["id", I.uint16], ["type", I.uint8], ["posX", I.coordx], ["posY", I.coordy], ["speedX", I.speed], ["speedY", I.speed], ["accelX", I.accel], ["accelY", I.accel], ["maxSpeed", I.speed]]]],
        [A.EVENT_BOOST]: [["clock", I.uint32], ["id", I.uint16], ["boost", I.boolean], ["posX", I.coord24], ["posY", I.coord24], ["rot", I.rotation], ["speedX", I.speed], ["speedY", I.speed], ["energy", I.healthnergy], ["energyRegen", I.regen]],
        [A.EVENT_BOUNCE]: [["clock", I.uint32], ["id", I.uint16], ["keystate", I.uint8], ["posX", I.coord24], ["posY", I.coord24], ["rot", I.rotation], ["speedX", I.speed], ["speedY", I.speed]],
        [A.EVENT_STEALTH]: [["id", I.uint16], ["state", I.boolean], ["energy", I.healthnergy], ["energyRegen", I.regen]],
        [A.EVENT_LEAVEHORIZON]: [["type", I.uint8], ["id", I.uint16]],
        [A.MOB_UPDATE]: [["clock", I.uint32], ["id", I.uint16], ["type", I.uint8], ["posX", I.coordx], ["posY", I.coordy], ["speedX", I.speed], ["speedY", I.speed], ["accelX", I.accel], ["accelY", I.accel], ["maxSpeed", I.speed]],
        [A.MOB_UPDATE_STATIONARY]: [["id", I.uint16], ["type", I.uint8], ["posX", I.float32], ["posY", I.float32]],
        [A.MOB_DESPAWN]: [["id", I.uint16], ["type", I.uint8]],
        [A.MOB_DESPAWN_COORDS]: [["id", I.uint16], ["type", I.uint8], ["posX", I.coordx], ["posY", I.coordy]],
        [A.SCORE_UPDATE]: [["id", I.uint16], ["score", I.uint32], ["earnings", I.uint32], ["upgrades", I.uint16], ["totalkills", I.uint32], ["totaldeaths", I.uint32]],
        [A.SCORE_BOARD]: [["data", I.array, [["id", I.uint16], ["score", I.uint32], ["level", I.uint8]]], ["rankings", I.array, [["id", I.uint16], ["x", I.uint8], ["y", I.uint8]]]],
        [A.SCORE_DETAILED]: [["scores", I.array, [["id", I.uint16], ["level", I.uint8], ["score", I.uint32], ["kills", I.uint16], ["deaths", I.uint16], ["damage", I.float32], ["ping", I.uint16]]]],
        [A.SCORE_DETAILED_CTF]: [["scores", I.array, [["id", I.uint16], ["level", I.uint8], ["captures", I.uint16], ["score", I.uint32], ["kills", I.uint16], ["deaths", I.uint16], ["damage", I.float32], ["ping", I.uint16]]]],
        [A.SCORE_DETAILED_BTR]: [["scores", I.array, [["id", I.uint16], ["level", I.uint8], ["alive", I.boolean], ["wins", I.uint16], ["score", I.uint32], ["kills", I.uint16], ["deaths", I.uint16], ["damage", I.float32], ["ping", I.uint16]]]],
        [A.CHAT_TEAM]: [["id", I.uint16], ["text", I.text]],
        [A.CHAT_PUBLIC]: [["id", I.uint16], ["text", I.text]],
        [A.CHAT_SAY]: [["id", I.uint16], ["text", I.text]],
        [A.CHAT_WHISPER]: [["from", I.uint16], ["to", I.uint16], ["text", I.text]],
        [A.CHAT_VOTEMUTEPASSED]: [["id", I.uint16]],
        [A.CHAT_VOTEMUTED]: [],
        [A.SERVER_MESSAGE]: [["type", I.uint8], ["duration", I.uint32], ["text", I.textbig]],
        [A.SERVER_CUSTOM]: [["type", I.uint8], ["data", I.textbig]]
    };
    Network.KEYPACKET = S,
    Network.KEYLOOKUP = {
        1: "UP",
        2: "DOWN",
        3: "LEFT",
        4: "RIGHT",
        5: "FIRE",
        6: "SPECIAL"
    },
    Network.CLIENTPACKET = P,
    Network.SERVERPACKET = A,
    Network.STATE = {
        LOGIN: 1,
        CONNECTING: 2,
        PLAYING: 3
    }
})();



// Tools

(function() {
    var e = {}
      , t = 0
      , n = {
        started: !1,
        startX: 200,
        startY: -2450,
        pan: 0,
        dist: 100,
        explosion: 4e3,
        direction: 1
    };
    Tools.updateReel = function() {
        if (!n.started) {
            n.pos = Vector.zero();
            for (var e, t = [3, 1, 2, 4, 5], r = [-270, -150, 0, 150, 270], i = 0; i < t.length; i++)
                Players.add({
                    id: i + 1,
                    team: 1,
                    status: 0,
                    reel: !0,
                    name: "",
                    type: t[i],
                    posX: 0,
                    posY: 0,
                    rot: 0,
                    flag: 1
                }),
                (e = Players.get(i + 1)).keystate.UP = !0,
                e._offset = r[i]
        }
        n.started = !0,
        n.dist > 2e3 ? n.direction = -1 : n.dist < 100 && (n.direction = 1),
        n.dist += .5 * n.direction * game.timeFactor,
        n.pan += 1 / n.dist * game.timeFactor,
        n.pos.x = n.startX + Math.sin(n.pan) * n.dist,
        n.pos.y = n.startY - Math.cos(n.pan) * n.dist,
        Graphics.setCamera(n.pos.x, n.pos.y),
        Players.update(),
        Particles.update();
        for (var o, s = 1; s <= 5; s++)
            (o = Players.get(s)).pos.x = n.pos.x + o._offset,
            o.pos.y = n.pos.y + game.screenY / game.scale * .24,
            null != o._prevPos ? o.rot = new Vector(o.pos.x - o._prevPos.x,o.pos.y - o._prevPos.y).angle() + Math.PI : o._prevPos = o.pos.clone(),
            o._prevPos = new Vector((19 * o._prevPos.x + o.pos.x) / 20,(19 * o._prevPos.y + o.pos.y) / 20);
        if (game.time > n.explosion) {
            var a = new Vector(Tools.rand(n.pos.x - game.halfScreenX / game.scale, n.pos.x + game.halfScreenX / game.scale),Tools.rand(n.pos.y - game.halfScreenY / game.scale, n.pos.y + game.halfScreenY / game.scale));
            Particles.explosion(a, Tools.rand(2, 2.5), Tools.randInt(4, 7)),
            Particles.explosion(new Vector(a.x + Tools.rand(-100, 100),a.y + Tools.rand(-100, 100)), Tools.rand(1, 1.2)),
            n.explosion = game.time + Tools.rand(1e3, 3e3)
        }
    }
    ,
    Tools.wipeReel = function() {
        Particles.wipe(),
        Players.wipe()
    }
    ,
    Tools.startupMsg = function() {
        console.log("%cΛIRMΛSH Engine " + game.version + " starting up!", "font-size: 20px;"),
        console.log(""),
        console.log("%c*** Important message ***", "font-size: 16px; color: red;"),
        console.log("%cDo not paste any commands given by players in this console window", "font-size: 14px; color: red;"),
        console.log("")
    }
    ,
    Tools.detectCapabilities = function() {
        r(),
        config.mobile && !config.settings.mobileshown && (UI.popBigMsg(1),
        config.settings.mobileshown = !0,
        Tools.setSettings({
            mobileshown: !0
        })),
        config.mobile && Input.setupLogin()
    }
    ;
    var r = function() {
        config.mobile = "ontouchstart"in document.documentElement && void 0 !== window.orientation || -1 !== navigator.userAgent.indexOf("IEMobile"),
        config.ios = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream,
        "#forcemobile" == window.location.hash && (config.mobile = !0),
        "#nomobile" == window.location.hash && (config.mobile = !1)
    };
    Tools.loadSettings = function() {
        var e = s();
        config.storage = e,
        DEVELOPMENT && console.log(e),
        null != e.id && (config.settings.id = e.id),
        null != e.session && (config.settings.session = e.session),
        null != e.name && (config.settings.name = e.name),
        null != e.region && (config.settings.region = e.region),
        null != e.helpshown && (config.settings.helpshown = e.helpshown),
        null != e.mobileshown && (config.settings.mobileshown = e.mobileshown),
        null != e.flag && (config.settings.flag = e.flag),
        null != e.hidpi && (config.settings.hidpi = e.hidpi),
        null != e.sound && (config.settings.sound = e.sound),
        null != e.keybinds && (config.settings.keybinds = e.keybinds),
        null != e.mousemode && (config.settings.mousemode = e.mousemode),
        i()
    }
    ;
    var i = function() {
        if (null == config.settings.id) {
            var e = Tools.randomID(16);
            config.settings.id = e,
            Tools.setSettings({
                id: e
            })
        }
        null != config.settings.name && $("#playername").val(config.settings.name),
        null != config.settings.region && (game.playRegion = config.settings.region),
        null != config.settings.flag && (game.myFlag = config.settings.flag),
        null == config.settings.sound && (config.settings.sound = !0),
        config.settings.mousemode && Input.toggleMouse(!0),
        UI.updateSound(),
        config.settings.oldhidpi = config.settings.hidpi
    };
    Tools.randomID = function(e) {
        var t = new Uint8Array(e);
        return window.crypto.getRandomValues(t),
        o(t).substr(0, e)
    }
    ;
    var o = function(e) {
        for (var t, n = "", r = 0; r < e.length; r++)
            n += t = 1 === (t = (255 & e[r]).toString(16)).length ? "0" + t : t;
        return n
    };
    Tools.setSettings = function(e) {
		return;
        if (null != window.localStorage) {
            for (var t in e)
                config.storage[t] = e[t];
            try {
                localStorage.setItem("settings", JSON.stringify(config.storage))
            } catch (e) {}
        }
    }
    ,
    Tools.removeSetting = function(e) {
        if (null != window.localStorage) {
            null != config.storage[e] && delete config.storage[e];
            try {
                localStorage.setItem("settings", JSON.stringify(config.storage))
            } catch (e) {}
        }
    }
    ,
    Tools.wipeSettings = function() {
        if (null != window.localStorage) {
            config.storage = {},
            config.settings = {};
            try {
                localStorage.setItem("settings", JSON.stringify(config.storage))
            } catch (e) {}
        }
    }
    ;
    var s = function() {
        if (null == window.localStorage)
            return {};
        var e = null
          , t = {};
        try {
            e = localStorage.getItem("settings")
        } catch (e) {}
        if (null != e)
            try {
                t = JSON.parse(e)
            } catch (e) {}
        return t
    };
    Tools.ajaxPost = function(e, t, n) {
        $.ajax({
            url: e,
            method: "POST",
            data: t,
            dataType: "json",
            timeout: 1e4,
            success: function(e) {
                null != n && n(null != e && 1 == e.result ? e : null)
            },
            error: function() {
                null != n && n(null)
            }
        })
    }
    ,
    Tools.length = function(e, t) {
        return Math.sqrt(e * e + t * t)
    }
    ,
    Tools.oscillator = function(e, t, n) {
        return 1 + Math.sin((game.time + (n || 0)) / t) * e
    }
    ,
    Tools.converge = function(e, t, n) {
        return Math.abs(e - t) < .01 ? t : e + n * (t - e)
    }
    ,
    Tools.rand = function(e, t) {
        return Math.random() * (t - e) + e
    }
    ,
    Tools.randCircle = function() {
        return Tools.rand(0, 6.28318530718)
    }
    ,
    Tools.randInt = function(e, t) {
        var n = Math.floor(Math.random() * (t + 1 - e) + e);
        return n >= t && (n = t),
        n
    }
    ,
    Tools.clamp = function(e, t, n) {
        return e <= t ? t : e >= n ? n : e
    }
    ,
    Tools.lerp = function(e, t, n) {
        return n * (t - e) + e
    }
    ,
    Tools.colorLerp = function(e, t, n) {
        n <= 0 && (n = .001),
        n >= 1 && (n = .999);
        var r = e >> 16
          , i = e >> 8 & 255
          , o = 255 & e;
        return (1 << 24) + (r + n * ((t >> 16) - r) << 16) + (i + n * ((t >> 8 & 255) - i) << 8) + (o + n * ((255 & t) - o)) | 0
    }
    ,
    Tools.distance = function(e, t, n, r) {
        var i = e - n
          , o = t - r;
        return Math.sqrt(i * i + o * o)
    }
    ,
    Tools.distFastCheck = function(e, t, n, r) {
        return Math.abs(e.x - t.x) <= n && Math.abs(e.y - t.y) <= r
    }
    ,
    Tools.distFastCheckFloat = function(e, t, n, r, i) {
        return Math.abs(e - n) <= i && Math.abs(t - r) <= i
    }
    ,
    Tools.updateTime = function(e) {
        game.timeFactor = e < 60 ? e : 60,
        game.timeFactorUncapped = game.timeFactor,
        game.timeFactor > 10 && (game.timeFactor = 10),
        game.time = performance.now(),
        game.frames++
    }
    ,
    Tools.reducedFactor = function() {
        var e = (performance.now() - game.time) / 16.666;
        return Math.abs(game.jitter) > .1 && (e += game.jitter / 16.666),
        e
    }
    ;
    var a = {
        shockwave: [.1, .1, .11, .12, .12, .13, .14, .14, .15, .16, .17, .18, .2, .21, .22, .24, .26, .29, .31, .35, .38, .42, .47, .52, .58, .64, .71, .78, .84, .9, .95, .98, 1, 1, 1, .98, .97, .94, .9, .85, .78, .7, .62, .52, .43, .34, .26, .18, .11, .05, 0],
        explosionSmoke: [0, 0, .02, .06, .13, .26, .45, .71, .91, .99, .99, .97, .94, .92, .89, .86, .83, .8, .77, .74, .71, .68, .65, .63, .6, .57, .54, .51, .48, .45, .42, .4, .37, .34, .31, .29, .26, .24, .21, .19, .16, .14, .12, .1, .08, .06, .04, .02, .01, 0, 0]
    };
    Tools.easing = {
        outElastic: function(e, t) {
            var n = 1 - (t || .7)
              , r = 2 * e;
            if (0 === e || 1 === e)
                return e;
            var i = n / (2 * Math.PI) * Math.asin(1);
            return Math.pow(2, -10 * r) * Math.sin((r - i) * (2 * Math.PI) / n) + 1
        },
        custom: function(e, t) {
            var n = a[t]
              , r = n.length
              , i = Math.floor(e * (r - 1))
              , o = n[i];
            return i === r - 1 ? o : Tools.lerp(o, n[i + 1], e * (r - 1) % 1)
        }
    },
    Tools.setupDebug = function() {
        DEVELOPMENT && config.debug.show && (UI.show("#debug"),
        game.debug = {
            last: performance.now(),
            ticks: 0,
            frames: game.frames
        },
        setInterval(Tools.updateDebug, 2123))
    }
    ,
    Tools.debugLine = function(e, t) {
        return '<div class="line"><span class="attr">' + UI.escapeHTML(e) + '</span><span class="val">' + UI.escapeHTML(t) + "</span></div>"
    }
    ,
    Tools.updateDebug = function() {
        var e = performance.now()
          , t = 1e3 * (game.frames - game.debug.frames) / (e - game.debug.last)
          , n = Players.count()
          , r = Mobs.count()
          , i = Mobs.countDoodads()
          , o = ""
          , s = Players.getMe();
        null != s && (o = Tools.debugLine("Coords", Math.round(s.pos.x) + ", " + Math.round(s.pos.y)));
        var a = Tools.debugLine("FPS", Math.round(t)) + Tools.debugLine("Ticks", (game.debug.ticks / (e - game.debug.last) * 100).toFixed(2) + "%") + Tools.debugLine("Ping", game.ping.toFixed(2) + " ms") + Tools.debugLine("Res", game.screenX + " x " + game.screenY) + '<div class="spacer"></div>' + Tools.debugLine("Players", n[0] + " / " + n[1]) + Tools.debugLine("Mobs", r[0] + " / " + r[1]) + Tools.debugLine("Particles", Particles.count()) + Tools.debugLine("Doodads", i[0] + " / " + i[1]) + '<div class="spacer"></div>' + o + Tools.debugLine("Scale", game.scale.toFixed(2)) + Tools.debugLine("Jitter", game.jitter.toFixed(3)) + '<div class="close" onclick="Tools.hideDebug()">x</div>';
        $("#debug").html(a),
        game.debug.last = e,
        game.debug.ticks = 0,
        game.debug.frames = game.frames
    }
    ,
    Tools.hideDebug = function() {
        UI.hide("#debug")
    }
    ,
    Tools.debugStartFrame = function() {
        DEVELOPMENT && config.debug.show && (game.debug.startedFrame = performance.now())
    }
    ,
    Tools.debugEndFrame = function() {
        DEVELOPMENT && config.debug.show && null != game.debug.startedFrame && (game.debug.ticks += performance.now() - game.debug.startedFrame)
    }
    ,
    Tools.earningsToRank = function(e) {
        return Math.floor(.0111 * Math.pow(e, .5)) + 1
    }
    ,
    Tools.rankToEarnings = function(e) {
        return Math.pow((e - 1) / .0111, 2)
    }
    ,
    Tools.decodeKeystate = function(e, t) {
        e.keystate.UP = 0 != (1 & t),
        e.keystate.DOWN = 0 != (2 & t),
        e.keystate.LEFT = 0 != (4 & t),
        e.keystate.RIGHT = 0 != (8 & t),
        e.boost = 0 != (16 & t),
        e.strafe = 0 != (32 & t),
        e.stealthed = 0 != (64 & t),
        e.flagspeed = 0 != (128 & t)
    }
    ,
    Tools.decodeUpgrades = function(e, t) {
        e.speedupgrade = (0 != (1 & t) ? 1 : 0) + (0 != (2 & t) ? 2 : 0) + (0 != (4 & t) ? 4 : 0),
        e.powerups.shield = 0 != (8 & t),
        e.powerups.rampage = 0 != (16 & t)
    }
    ,
    Tools.decodeMinimapCoords = function(e, t) {
        return new Vector(128 * e - 16384 + 64,Tools.clamp(128 * t - 16384, -8192, 8192) + 64)
    }
    ,
    Tools.decodeSpeed = function(e) {
        return (e - 32768) / 1638.4
    }
    ,
    Tools.decodeCoordX = function(e) {
        return (e - 32768) / 2
    }
    ,
    Tools.decodeCoordY = function(e) {
        return (e - 32768) / 4
    }
    ,
    Tools.decodeCoord24 = function(e) {
        return (e - 8388608) / 512
    }
    ,
    Tools.decodeAccel = function(e) {
        return (e - 32768) / 32768
    }
    ,
    Tools.decodeRotation = function(e) {
        return e / 6553.6
    }
    ,
    Tools.decodeHealthnergy = function(e) {
        return e / 255
    }
    ,
    Tools.decodeRegen = function(e) {
        return (e - 32768) / 1e6
    }
    ;
    var l = function(t) {
        return Tools.clamp(Math.floor(t / e.size) + e.bucketsHalfX, 0, e.bucketsMaxX)
    }
      , u = function(t) {
        return Tools.clamp(Math.floor(t / e.size) + e.bucketsHalfY, 0, e.bucketsMaxY)
    };
    Tools.initBuckets = function() {
        e = {
            size: config.bucketSize,
            halfSize: parseInt(config.bucketSize / 2),
            bucketsMaxX: parseInt(config.mapWidth / config.bucketSize) - 1,
            bucketsMaxY: parseInt(config.mapHeight / config.bucketSize) - 1,
            bucketsHalfX: parseInt(config.mapWidth / config.bucketSize / 2),
            bucketsHalfY: parseInt(config.mapHeight / config.bucketSize / 2)
        };
        for (var t = 0; t <= e.bucketsMaxX; t++) {
            game.buckets.push([]);
            for (var n = 0; n <= e.bucketsMaxY; n++)
                game.buckets[t].push([[]])
        }
        for (var r = 0; r < config.doodads.length; r++)
            t = l(config.doodads[r][0]),
            n = u(config.doodads[r][1]),
            game.buckets[t][n][0].push(r)
    }
    ,
    Tools.getBucketBounds = function(t, n, r) {
        return [Tools.clamp(Math.floor((t.x - n) / e.size) + e.bucketsHalfX, 0, e.bucketsMaxX), Tools.clamp(Math.floor((t.x + n) / e.size) + e.bucketsHalfX, 0, e.bucketsMaxX), Tools.clamp(Math.floor((t.y - r) / e.size) + e.bucketsHalfY, 0, e.bucketsMaxY), Tools.clamp(Math.floor((t.y + r) / e.size) + e.bucketsHalfY, 0, e.bucketsMaxY)]
    }
    ,
    Tools.deferUpdate = function(e) {
        setTimeout(e, 1)
    }
    ;
    var c = function(e, t) {
        if (t instanceof Error) {
            var n = {};
            return Object.getOwnPropertyNames(t).forEach(function(e) {
                n[e] = t[e]
            }),
            n
        }
        return t
    };
    Tools.handleError = function(e) {
        ++t > 5 || (null != e.error && (e.error = JSON.stringify(e.error, c)),
        Tools.ajaxPost("/clienterror", {
            type: "runtime",
            error: JSON.stringify(e, null, "\t\t")
        }))
    }
    ,
    Tools.encodeUTF8 = function(e) {
        for (var t = 0, n = new Uint8Array(4 * e.length), r = 0; r != e.length; r++) {
            var i = e.charCodeAt(r);
            if (i < 128)
                n[t++] = i;
            else {
                if (i < 2048)
                    n[t++] = i >> 6 | 192;
                else {
                    if (i > 55295 && i < 56320) {
                        if (++r == e.length)
                            throw "UTF-8 encode: incomplete surrogate pair";
                        var o = e.charCodeAt(r);
                        if (o < 56320 || o > 57343)
                            throw "UTF-8 encode: second char code 0x" + o.toString(16) + " at index " + r + " in surrogate pair out of range";
                        i = 65536 + ((1023 & i) << 10) + (1023 & o),
                        n[t++] = i >> 18 | 240,
                        n[t++] = i >> 12 & 63 | 128
                    } else
                        n[t++] = i >> 12 | 224;
                    n[t++] = i >> 6 & 63 | 128
                }
                n[t++] = 63 & i | 128
            }
        }
        return n.subarray(0, t)
    }
    ,
    Tools.decodeUTF8 = function(e) {
        for (var t = "", n = 0; n < e.length; ) {
            var r = e[n++];
            if (r > 127) {
                if (r > 191 && r < 224) {
                    if (n >= e.length)
                        throw "UTF-8 decode: incomplete 2-byte sequence";
                    r = (31 & r) << 6 | 63 & e[n]
                } else if (r > 223 && r < 240) {
                    if (n + 1 >= e.length)
                        throw "UTF-8 decode: incomplete 3-byte sequence";
                    r = (15 & r) << 12 | (63 & e[n]) << 6 | 63 & e[++n]
                } else {
                    if (!(r > 239 && r < 248))
                        throw "UTF-8 decode: unknown multibyte start 0x" + r.toString(16) + " at index " + (n - 1);
                    if (n + 2 >= e.length)
                        throw "UTF-8 decode: incomplete 4-byte sequence";
                    r = (7 & r) << 18 | (63 & e[n]) << 12 | (63 & e[++n]) << 6 | 63 & e[++n]
                }
                ++n
            }
            if (r <= 65535)
                t += String.fromCharCode(r);
            else {
                if (!(r <= 1114111))
                    throw "UTF-8 decode: code point 0x" + r.toString(16) + " exceeds UTF-16 reach";
                r -= 65536,
                t += String.fromCharCode(r >> 10 | 55296),
                t += String.fromCharCode(1023 & r | 56320)
            }
        }
        return t
    }
})();






// Players

(function() {
    var e = {}
      , t = [-1, -1, -1]
      , n = ["badge_gold", "badge_silver", "badge_bronze"];
    Players.update = function() {
        var t, n;
        for (t in e)
            0 == (n = e[t]).status && (n.update(game.timeFactor),
            n.updateGraphics(game.timeFactor));
        if (null != game.spectatingID) {
            if (null == (n = e[game.spectatingID]))
                return;
            if (game.timeNetwork - n.lastPacket > 3e3)
                return;
            Graphics.setCamera(n.pos.x, n.pos.y)
        } else if (null != game.myID) {
            if (null == (n = e[game.myID]))
                return;
            0 == n.status && UI.updateHUD(n.health, n.energy, n),
            Graphics.setCamera(n.pos.x, n.pos.y)
        }
    }
    ,
    Players.add = function(t, n) {
        e[t.id] = new Player(t,n)
    }
    ,
    Players.get = function(t) {
        return e[t]
    }
    ,
    Players.getMe = function() {
        return e[game.myID]
    }
    ,
    Players.amIAlive = function() {
        var e = Players.getMe();
        return null != e && 0 == e.status
    }
    ,
    Players.getIDs = function() {
        var t = {};
        for (var n in e)
            t[n] = !0;
        return t
    }
    ,
    Players.getByName = function(t) {
        var n;
        for (n in e)
            if (e[n].name === t)
                return e[n];
        return null
    }
    ,
    Players.network = function(t, n) {
        var r = e[n.id];
        if (null != r)
            switch (t) {
            case Network.SERVERPACKET.PLAYER_UPDATE:
            case Network.SERVERPACKET.PLAYER_FIRE:
            case Network.SERVERPACKET.EVENT_BOOST:
            case Network.SERVERPACKET.EVENT_BOUNCE:
                r.networkKey(t, n);
                break;
            case Network.SERVERPACKET.CHAT_SAY:
                r.sayBubble(n);
                break;
            case Network.SERVERPACKET.PLAYER_RESPAWN:
                r.respawn(n);
                break;
            case Network.SERVERPACKET.PLAYER_FLAG:
                n.id == game.myID && (game.myFlag = game.lastFlagSet,
                Tools.setSettings({
                    flag: game.lastFlagSet
                })),
                r.changeFlag(n)
            }
    }
    ,
    Players.stealth = function(t) {
        var n = e[t.id];
        null != n && n.stealth(t)
    }
    ,
    Players.leaveHorizon = function(t) {
        var n = e[t.id];
        null != n && n.leaveHorizon()
    }
    ,
    Players.updateBadges = function(r) {
        for (var i, o = Tools.clamp(r.length, 0, 3), s = [], a = 0; a < o; a++)
            null != (i = e[r[a].id]) && (s.push(i.id),
            i.state.badge != a && (i.state.badge = a,
            i.changeBadge(n[a])),
            i.state.hasBadge || (i.state.hasBadge = !0,
            i.render && (1/*i.sprites.badge.visible = !0*/)));
        for (var l = 0; l < t.length; l++)
            if (-1 == s.indexOf(t[l])) {
                if (null == (i = e[t[l]]))
                    continue;
                i.state.hasBadge && (i.state.hasBadge = !1/*,
                i.sprites.badge.visible = !1*/)
            }
        t = s
    }
    ,
    Players.chat = function(t) {
        var n = e[t.id];
        null != n && UI.addChatLine(n, t.text, 0)
    }
    ,
    Players.teamChat = function(t) {
        var n = e[t.id];
        null != n && UI.addChatLine(n, t.text, 3)
    }
    ,
    Players.votemutePass = function(t) {
        var n = e[t.id];
        null != n && UI.chatVotemutePass(n)
    }
    ,
    Players.whisper = function(t) {
        var n;
        if (t.to == game.myID) {
            if (null == (r = e[t.from]))
                return;
            n = 2
        } else {
            var r;
            if (null == (r = e[t.to]))
                return;
            n = 1
        }
        UI.addChatLine(r, t.text, n)
    }
    ,
    Players.impact = function(t) {
        for (var n = 0; n < t.players.length; n++) {
            var r = e[t.players[n].id];
            null != r && r.impact(t.type, new Vector(t.posX,t.posY), t.players[n].health, t.players[n].healthRegen)
        }
		playerImpacted(t);//*mod
    }
    ,
    Players.powerup = function(e) {
        Players.getMe().powerup(e)
    }
    ,
    Players.updateLevel = function(t) {
        var n = e[t.id];
        null != n && n.updateLevel(t)
    }
    ,
    Players.reteam = function(t) {
        var n = e[t.id];
        null != n && n.reteam(t.team)
    }
    ;
    Players.kill = function(t) {
        var n = e[t.id];
        if (null != n)
            if (0 != t.killer || 0 != t.posX || 0 != t.posY) {
                if (n.kill(t),
                n.me()) {
                    UI.visibilityHUD(!1);
                    var r = e[t.killer];
                    null != r && UI.killedBy(r),
                    UI.showSpectator('<div onclick="Network.spectateNext()" class="spectate">ENTER SPECTATOR MODE</div>')
                } else
                    t.killer === game.myID && UI.killed(n);
                n.me() || n.id != game.spectatingID || 3 != game.gameType || Games.spectatorSwitch(n.id)
            } else
                !function(e) {
                    e.kill({
                        posX: 0,
                        posY: 0,
                        spectate: !0
                    }),
                    UI.visibilityHUD(!1)
                }(n)
    }
    ,
    Players.destroy = function(t) {
        t == game.spectatingID && ($("#spectator-tag").html("Spectating"),
        Games.spectatorSwitch(t));
        var n = e[t];
        null != n && (n.destroy(!0),
        delete e[t]);
		//UI._players_destroy_hook(n.name);
    }
    ,
    Players.changeType = function(t) {
        var n = e[t.id];
        null != n && n.changeType(t)
    }
    ,
    Players.count = function() {
        var t, n = 0, r = 0;
        for (t in e)
            n++,
            e[t].culled && r++;
        return [n - r, n]
    }
    ,
    Players.wipe = function() {
        for (var t in e)
            e[t].destroy(!0),
            delete e[t]
    }
})();





// class Vector

class Vector {
    constructor(e, t) {
        this.x = e,
        this.y = t
    }
    add(e) {
        this.x += e,
        this.y += e
    }
    divide(e) {
        this.x /= e,
        this.y /= e
    }
    multiply(e) {
        this.x *= e,
        this.y *= e
    }
    limit(e) {
        this.divide(this.length()),
        this.multiply(e)
    }
    clone() {
        return new Vector(this.x,this.y)
    }
    length() {
        return Math.sqrt(this.x * this.x + this.y * this.y)
    }
    angle() {
        return Math.atan2(this.y, this.x) - Math.PI / 2
    }
    ceil(e) {
        this.x > e && (this.x = e),
        this.y > e && (this.y = e)
    }
    floor(e) {
        this.x < e && (this.x = e),
        this.y < e && (this.y = e)
    }
    both(e) {
        this.x = e,
        this.y = e
    }
    static zero() {
        return new Vector(0,0)
    }
    static diag(e) {
        return new Vector(e,e)
    }
    static create(e, t) {
        return new Vector(Math.sin(e) * t,-Math.cos(e) * t)
    }
    static createOff(e, t, n) {
        return new Vector(e.x + Math.sin(t) * n,e.y - Math.cos(t) * n)
    }
}


// Graphics

(function() {
    var e, t = {
        position: Vector.zero(),
        center: Vector.zero(),
        lastOverdraw: Vector.zero(),
        lastOverdrawTime: 0,
        shake: 0
    }, n = {}, r = {}, i = {};
    Graphics.setup = function() {
        l(window.innerWidth, window.innerHeight),
        o(),
        Textures.load(),
        s(),
        u(),
        a(),
        h(),
        Mobs.setupDoodads(),
        UI.setupMinimap(),
        UI.setupHUD()
    }
    ;
    var o = function() {
        PIXI.utils.skipHello(),
        PIXI.settings.PRECISION_FRAGMENT = PIXI.PRECISION.HIGH;
        var t = {
            autoResize: !0,
            clearBeforeRender: !1,
            preserveDrawingBuffer: !0
        };
        config.settings.hidpi && (t.resolution = 2);
        try {
            e = new PIXI.WebGLRenderer(game.screenX,game.screenY,t)
        } catch (e) {
            return void UI.popBigMsg(2)
        }
        document.body.appendChild(e.view)
    }
      , s = function() {
        for (var e of ["game", "ui0", "ui1", "ui2", "ui3", "ui4", "hudHealth", "hudEnergy", "flags", "doodads", "map", "sea", "objects", "groundobjects", "fields", "shadows", "powerups", "crates", "aircraft", "aircraftme", "glows", "playernames", "bubbles", "thrusters", "projectiles", "smoke", "explosions"])
            i[e] = new PIXI.Container;
        for (var t of ["smoke", "crates", "thrusters", "projectiles", "aircraft", "aircraftme", "glows", "explosions", "powerups", "playernames", "flags", "bubbles"])
            i.objects.addChild(i[t]);
        for (var n of ["fields"])
            i.groundobjects.addChild(i[n]);
        if (game.graphics.layers = i,
        game.graphics.gui = r,
        config.debug.collisions) {
            for (var o = new PIXI.Graphics, s = 0; s < config.walls.length; s++)
                o.beginFill(16777215, .2),
                o.drawCircle(config.walls[s][0], config.walls[s][1], config.walls[s][2]),
                o.endFill();
            i.objects.addChild(o)
        }
    }
      , a = function() {
        n.render = PIXI.RenderTexture.create(game.screenX + config.overdraw, game.screenY + config.overdraw, void 0, config.settings.hidpi ? 2 : void 0),
        n.renderSprite = new PIXI.Sprite(n.render),
        n.shadows = PIXI.RenderTexture.create(game.shadowX, game.shadowY, void 0, config.settings.hidpi ? 2 : void 0),
        n.shadowsSprite = new PIXI.Sprite(n.shadows),
        n.shadowsSprite.scale.set(game.screenX / game.shadowX, game.screenY / game.shadowY),
        n.shadowsSprite.blendMode = PIXI.BLEND_MODES.MULTIPLY,
        n.shadowsSprite.alpha = .4,
        i.game.addChild(n.renderSprite),
        i.game.addChild(i.groundobjects),
        i.game.addChild(n.shadowsSprite),
        n.shade = Textures.sprite("screenshade"),
        n.shade.scale.set(game.shadowX / 126 / game.scale, game.shadowY / 126 / game.scale),
        n.shade.alpha = .825,
        n.shade.anchor.set(.5, .5),
        i.shadows.addChild(n.shade),
        i.game.addChild(i.objects),
        i.game.addChild(i.ui0),
        i.game.addChild(i.ui1),
        i.game.addChild(i.ui2),
        i.game.addChild(i.ui3),
        i.game.addChild(i.ui4),
        r.hudTextureEnergy = PIXI.RenderTexture.create(80, 348, void 0, config.settings.hidpi ? 2 : void 0),
        r.hudSpriteEnergy = new PIXI.Sprite(r.hudTextureEnergy),
        r.hudSpriteEnergy.pivot.set(-250, 174),
        r.hudTextureHealth = PIXI.RenderTexture.create(80, 348, void 0, config.settings.hidpi ? 2 : void 0),
        r.hudSpriteHealth = new PIXI.Sprite(r.hudTextureHealth),
        r.hudSpriteHealth.pivot.set(330, 174),
        i.game.addChild(r.hudSpriteEnergy),
        i.game.addChild(r.hudSpriteHealth)
    };
    Graphics.resizeRenderer = function(r, i) {
        var o = r + config.overdraw
          , s = i + config.overdraw;
        l(r, i),
        u(),
        e.resize(r, i),
        n.render.resize(o, s),
        n.shadows.resize(r, i),
        n.shadowsSprite.scale.set(game.screenX / game.shadowX, game.screenY / game.shadowY),
        n.shade.scale.set(game.shadowX / 126 / game.scale, game.shadowY / 126 / game.scale);
        for (var a of ["sea", "forest", "sand", "rock"])
            n[a].width = o,
            n[a].height = s;
        UI.resizeMinimap(),
        UI.resizeHUD(),
        d(),
        p(),
        Graphics.setCamera(t.center.x, t.center.y),
        game.state == Network.STATE.PLAYING && Network.resizeHorizon()
    }
    ,
    Graphics.toggleHiDPI = function() {
        config.settings.hidpi = !(1 == config.settings.hidpi),
        config.settings.hidpi ? Tools.setSettings({
            hidpi: !0
        }) : Tools.removeSetting("hidpi"),
        UI.updateMainMenuSettings(),
        1 == config.settings.oldhidpi == config.settings.hidpi ? UI.showMessage("alert", "", 1e3) : UI.showMessage("alert", 'Reload game to apply HiDPI settings<br><span class="button" onclick="Games.redirRoot()">RELOAD</span>', 1e4)
    }
    ;
    var l = function(e, t) {
        game.screenX = e,
        game.screenY = t,
        game.halfScreenX = e / 2,
        game.halfScreenY = t / 2,
        game.shadowX = Math.floor(game.screenX / config.shadowScaling),
        game.shadowY = Math.floor(game.screenY / config.shadowScaling)
    }
      , u = function() {
        game.scale = (game.screenX + game.screenY) / config.scalingFactor,
        i.groundobjects.scale.set(game.scale),
        i.objects.scale.set(game.scale),
        i.shadows.scale.set(game.scale),
        i.doodads.scale.set(game.scale),
        i.bubbles.scale.set(1 / game.scale),
        c()
    }
      , c = function() {
        if (config.mobile) {
            var e = game.screenX > game.screenY ? "landscape" : "portrait";
            config.phone = game.screenX <= 599 && "portrait" == e || game.screenY <= 599 && "landscape" == e,
            config.tablet = game.screenX >= 600 && game.screenX <= 1024 && "portrait" == e || game.screenY >= 600 && game.screenY <= 1024 && game.screenX <= 1024 && "landscape" == e,
            config.maxScoreboard = 8,
            config.phone && (config.minimapSize = 160,
            config.maxScoreboard = 5),
            config.tablet && (config.maxScoreboard = 7),
            config.minimapPaddingX = game.screenX / 2 - config.minimapSize / 2
        }
    }
      , h = function() {
        var t = e.width + config.overdraw
          , r = e.height + config.overdraw;
        n.sea = Textures.tile("map_sea", t, r),
        n.sea_mask = Textures.sprite("map_sea_mask"),
        n.sea_mask.scale.set(8, 8),
        n.sea_mask.blendMode = PIXI.BLEND_MODES.MULTIPLY,
        n.sea_mask.alpha = .5,
        n.forest = Textures.tile("map_forest", t, r),
        n.sand = Textures.tile("map_sand", t, r),
        n.sand_mask = Textures.sprite("map_sand_mask"),
        n.sand_mask.scale.set(8, 8),
        n.sand.mask = n.sand_mask,
        n.rock = Textures.tile("map_rock", t, r),
        n.rock_mask = Textures.sprite("map_rock_mask"),
        n.rock_mask.scale.set(8, 8),
        n.rock.mask = n.rock_mask,
        i.sea.addChild(n.sea),
        i.sea.addChild(n.sea_mask);
        for (var o of ["forest", "sand", "sand_mask", "rock", "rock_mask"])
            i.map.addChild(n[o]);
        i.map.addChild(i.doodads),
        f(),
        d()
    }
      , d = function() {
        var e;
        for (e of ["sea", "forest", "sand", "rock"])
            n[e].tileScale.set(game.scale, game.scale);
        for (e of ["sea", "sand", "rock"])
            n[e + "_mask"].scale.set(8 * game.scale, 8 * game.scale)
    }
      , p = function() {
        n.polygons.scale.x = game.scale,
        n.polygons.scale.y = game.scale
    }
      , f = function() {
        $.getJSON("assets/map.json", function(e) {
            n.polygons = new PIXI.Graphics,
            n.polygons.beginFill();
            var t, r, o, s, a, l, u, c = 0, h = 0, d = 0;
            for (l = 0; l < e.length; l++)
                for (o = 0,
                u = 0; u < e[l].length; u++) {
                    for (s = [],
                    a = 0; a < e[l][u].length; a += 2)
                        t = e[l][u][a] + h,
                        r = e[l][u][a + 1] + d,
                        s.push(parseFloat(t), -parseFloat(r)),
                        h = t,
                        d = r,
                        c++;
                    n.polygons.drawPolygon(s),
                    0 != o && n.polygons.addHole(),
                    o++
                }
            n.polygons.endFill(),
            p(),
            i.map.addChild(n.polygons),
            i.map.mask = n.polygons
        })
    };
    Graphics.initSprite = function(e, t, n) {
        var r = Textures.sprite(e);
        return n.position && r.position.set(n.position[0], n.position[1]),
        n.anchor && r.anchor.set(n.anchor[0], n.anchor[1]),
        n.pivot && r.pivot.set(n.pivot[0], n.pivot[1]),
        n.scale && (Array.isArray(n.scale) ? r.scale.set(n.scale[0], n.scale[1]) : r.scale.set(n.scale)),
        n.rotation && (r.rotation = n.rotation),
        n.alpha && (r.alpha = n.alpha),
        n.blend && (r.blendMode = PIXI.BLEND_MODES[n.blend]),
        n.tint && (r.tint = n.tint),
        n.mask && (r.mask = n.mask),
        n.visible && (r.visible = n.visible),
        t.addChild(r),
        r
    }
    ,
    Graphics.transform = function(e, t, n, r, i, o, s) {
        e.position.set(t, n),
        null != o ? e.scale.set(i, o) : null != i && e.scale.set(i),
        null != r && (e.rotation = r),
        null != s && (e.alpha = s)
    }
    ,
    Graphics.update = function() {
        n.shade.position.set(t.center.x / config.shadowScaling, t.center.y / config.shadowScaling),
        n.renderSprite.position.set(game.scale * (-t.position.x + t.lastOverdraw.x) - config.overdraw / 2, game.scale * (-t.position.y + t.lastOverdraw.y) - config.overdraw / 2),
        i.objects.position.set(-t.position.x * game.scale, -t.position.y * game.scale),
        i.groundobjects.position.set(-t.position.x * game.scale, -t.position.y * game.scale),
        i.doodads.position.set(-t.position.x * game.scale + config.overdraw / 2, -t.position.y * game.scale + config.overdraw / 2),
        i.shadows.position.set(-t.position.x * (game.scale / config.shadowScaling), -t.position.y * (game.scale / config.shadowScaling)),
        r.minimap_box.position.set(game.screenX - config.minimapPaddingX - config.minimapSize * ((16384 - t.center.x) / 32768), game.screenY - config.minimapPaddingY - config.minimapSize / 2 * ((8192 - t.center.y) / 16384)),
        config.overdrawOptimize ? (Math.abs(t.position.x - t.lastOverdraw.x) > config.overdraw / 2 / game.scale || Math.abs(t.position.y - t.lastOverdraw.y) > config.overdraw / 2 / game.scale || game.time - t.lastOverdrawTime > 2e3) && g() : g()
    }
    ,
    Graphics.setCamera = function(e, n) {
        var r = 0
          , i = 0;
        t.shake > .5 && (r = Tools.rand(-t.shake, t.shake),
        i = Tools.rand(-t.shake, t.shake),
        t.shake *= 1 - .06 * game.timeFactor);
        var o = game.halfScreenX / game.scale
          , s = game.halfScreenY / game.scale;
        e = Tools.clamp(e, -16384 + o, 16384 - o),
        n = Tools.clamp(n, -8192 + s, 8192 - s),
        t.position.x = r + e - game.screenX / 2 / game.scale,
        t.position.y = i + n - game.screenY / 2 / game.scale,
        t.center.x = r + e,
        t.center.y = i + n
    }
    ,
    Graphics.getCamera = function() {
        return t.center
    }
    ,
    Graphics.shakeCamera = function(e, n) {
        var r = Tools.length(e.x - t.center.x, e.y - t.center.y)
          , i = (game.halfScreenX / game.scale + game.halfScreenY / game.scale) / 2
          , o = Tools.clamp(1.3 * (1 - r / i), 0, 1);
        o < .1 || (t.shake = o * n)
    }
    ,
    Graphics.shadowCoords = function(e) {
        var t = Mobs.getClosestDoodad(e);
        return new Vector((e.x + config.shadowOffsetX * t) / config.shadowScaling,(e.y + config.shadowOffsetY * t) / config.shadowScaling)
    }
    ,
    Graphics.minimapMob = function(e, t, n) {
        null != e && e.position.set(game.screenX - config.minimapPaddingX - config.minimapSize * ((16384 - t) / 32768), game.screenY - config.minimapPaddingY - config.minimapSize / 2 * ((8192 - n) / 16384))
    }
    ;
    Graphics.toggleFullscreen = function() {
        !function() {
            var e = document;
            return e.fullscreenElement ? null !== e.fullscreenElement : e.mozFullScreenElement ? null !== e.mozFullScreenElement : e.webkitFullscreenElement ? null !== e.webkitFullscreenElement : e.msFullscreenElement ? null !== e.msFullscreenElement : void 0
        }() ? function() {
            var e = document.documentElement;
            if (e.requestFullscreen ? e.requestFullscreen() : e.mozRequestFullScreen ? e.mozRequestFullScreen() : e.webkitRequestFullscreen ? e.webkitRequestFullscreen() : e.msRequestFullscreen && e.msRequestFullscreen(),
            config.mobile && null != window.screen && null != window.screen.orientation)
                try {
                    screen.orientation.lock("landscape")
                } catch (e) {}
        }() : function() {
            var e = document;
            e.exitFullscreen ? e.exitFullscreen() : e.mozCancelFullScreen ? e.mozCancelFullScreen() : e.webkitExitFullscreen ? e.webkitExitFullscreen() : e.msExitFullscreen && e.msExitFullscreen()
        }()
    }
    ,
    Graphics.inScreen = function(e, n) {
        return e.x >= t.center.x - game.halfScreenX / game.scale - n && e.x <= t.center.x + game.halfScreenX / game.scale + n && e.y >= t.center.y - game.halfScreenY / game.scale - n && e.y <= t.center.y + game.halfScreenY / game.scale + n
    }
    ;
    var g = function() {
        Mobs.updateDoodads(),
        t.lastOverdraw.x = t.position.x,
        t.lastOverdraw.y = t.position.y,
        n.renderSprite.position.set(-config.overdraw / 2, -config.overdraw / 2);
        var r, o = t.position.x - config.overdraw / game.scale / 2, s = t.position.y - config.overdraw / game.scale / 2, a = -o * game.scale, l = -s * game.scale, u = (-o - 16384) * game.scale, c = (-s - 8192) * game.scale;
        for (r of ["sea", "forest", "sand", "rock"])
            n[r].tilePosition.set(a, l);
        for (r of ["sea", "sand", "rock"])
            n[r + "_mask"].position.set(u, c);
        null != n.polygons && null != n.polygons.position && n.polygons.position.set(-o * game.scale, -s * game.scale),
        t.lastOverdrawTime = game.time,
        e.render(i.sea, n.render),
        e.render(i.map, n.render)
    };
    Graphics.render = function() {
        e.render(i.shadows, n.shadows, !0),
        e.render(i.hudEnergy, r.hudTextureEnergy, !0),
        e.render(i.hudHealth, r.hudTextureHealth, !0),
        e.render(i.game)
    }
})();






// Input


(function() {
    var e = {}
      , t = {}
      , n = {}
      , r = null
      , i = 0
      , o = 2 * Math.PI
      , s = null
      , a = !1
      , l = {}
      , u = !1
      , c = null
      , h = 0
      , d = {
        LEFT: ["LEFT", "A"],
        RIGHT: ["RIGHT", "D"],
        UP: ["UP", "W"],
        DOWN: ["DOWN", "S"],
        STRAFELEFT: ["Q"],
        STRAFERIGHT: ["E"],
        FIRE: ["SPACE"],
        SPECIAL: ["CTRL", "SHIFT"],
        SHOWSCORE: ["TAB"],
        MAINMENU: ["F1"],
        SHOWGAMES: ["F2"],
        FULLSCREEN: ["F"],
        MINIMIZECHAT: ["PGDOWN"],
        MAXIMIZECHAT: ["PGUP"],
        SAY: ["GRAVE"],
        TEAM: ["T"],
        REPLY: ["R"],
        SPECTATE: ["V"],
        UPGRADE1: ["1"],
        UPGRADE2: ["2"],
        UPGRADE3: ["3"],
        UPGRADE4: ["4"],
        SOUND: ["G"],
        HELP: ["H"],
        INVITE: ["I"],
        MOUSEMODE: ["M"]
    }
      , p = {}
      , f = {
        LEFT: !0,
        RIGHT: !0,
        UP: !0,
        DOWN: !0,
        FIRE: !0,
        SPECIAL: !0,
        STRAFELEFT: !0,
        STRAFERIGHT: !0
    }
      , g = {}
      , m = {
        MAINMENU: !0,
        FULLSCREEN: !0,
        INVITE: !0,
        SOUND: !0,
        SHOWSCORE: !0,
        SHOWGAMES: !0,
        HELP: !0
    }
      , v = [["Forward", "UP"], ["Backward", "DOWN"], ["Turn Left", "LEFT"], ["Turn Right", "RIGHT"], ["Fire", "FIRE"], ["Special", "SPECIAL"], ["Strafe Left", "STRAFELEFT"], ["Strafe Right", "STRAFERIGHT"], [""], ["Spectate", "SPECTATE"], ["Upgrade Speed", "UPGRADE1"], ["Upgrade Defense", "UPGRADE2"], ["Upgrade Energy", "UPGRADE3"], ["Upgrade Missiles", "UPGRADE4"], ["Scoreboard", "SHOWSCORE"], ["Main Menu", "MAINMENU"], ["Show Games", "SHOWGAMES"], ["Fullscreen", "FULLSCREEN"], ["Maximize Chat", "MAXIMIZECHAT"], ["Minimize Chat", "MINIMIZECHAT"], [""], ["In-game Say", "SAY"], ["Team Chat", "TEAM"], ["Reply", "REPLY"], ["Toggle Sound", "SOUND"], ["Help", "HELP"], ["Invite Friends", "INVITE"], ["Mouse Mode", "MOUSEMODE"]]
      , y = {}
      , b = {
        BACKSPACE: 8,
        TAB: 9,
        SHIFT: 16,
        CTRL: 17,
        ALT: 18,
        PAUSE: 19,
        CAPS: 20,
        SPACE: 32,
        PGUP: 33,
        PGDOWN: 34,
        END: 35,
        HOME: 36,
        LEFT: 37,
        UP: 38,
        RIGHT: 39,
        DOWN: 40,
        INSERT: 45,
        DELETE: 46,
        0: 48,
        1: 49,
        2: 50,
        3: 51,
        4: 52,
        5: 53,
        6: 54,
        7: 55,
        8: 56,
        9: 57,
        A: 65,
        B: 66,
        C: 67,
        D: 68,
        E: 69,
        F: 70,
        G: 71,
        H: 72,
        I: 73,
        J: 74,
        L: 76,
        M: 77,
        N: 78,
        O: 79,
        P: 80,
        Q: 81,
        R: 82,
        S: 83,
        T: 84,
        U: 85,
        V: 86,
        W: 87,
        X: 88,
        Y: 89,
        Z: 90,
        WINDOWL: 91,
        WINDOWR: 92,
        SELECT: 93,
        NUMPAD0: 96,
        NUMPAD1: 97,
        NUMPAD2: 98,
        NUMPAD3: 99,
        NUMPAD4: 100,
        NUMPAD5: 101,
        NUMPAD6: 102,
        NUMPAD7: 103,
        NUMPAD8: 104,
        NUMPAD9: 105,
        "*": 106,
        "+": 107,
        "-": 109,
        DECIMAL: 110,
        "/": 111,
        F1: 112,
        F2: 113,
        F3: 114,
        F4: 115,
        F5: 116,
        F6: 117,
        F7: 118,
        F8: 119,
        F9: 120,
        F10: 121,
        F11: 122,
        F12: 123,
        NUMLOCK: 144,
        SCROLL: 145,
        ":": 186,
        "=": 187,
        ",": 188,
        "-": 189,
        ".": 190,
        "/": 191,
        GRAVE: 192,
        "[": 219,
        "\\": 220,
        "]": 221,
        QUOTE: 222
    }
      , _ = ["UP", "DOWN", "LEFT", "RIGHT", "FIRE", "SPECIAL"]
      , x = ["UP", "DOWN", "LEFT", "RIGHT", "FIRE", "SPECIAL"];
    Input.setup = function() {
        for (var e in b)
            y[b[e]] = e;
        p = JSON.parse(JSON.stringify(d)),
        I(),
        M(!0),
        $(window).on("keydown", w),
        $(window).on("keyup", T),
        $(window).on("gamepadconnected", function(e) {
            UI.showMessage("alert", '<span class="info">GAMEPAD CONNECTED</span>' + UI.escapeHTML(e.originalEvent.gamepad.id), 3e3),
            a = !0,
            S()
        }),
        $(window).on("gamepaddisconnected", function(e) {
            UI.showMessage("alert", '<span class="info">GAMEPAD DISCONNECTED</span>' + UI.escapeHTML(e.originalEvent.gamepad.id), 3e3),
            a = !1,
            S()
        })
    }
    ;
    var w = function(r) {
        if (game.state == Network.STATE.PLAYING || game.state == Network.STATE.CONNECTING) {
            var i = r.which;
            if (72 != i && UI.hideHelp(),
            null != c && P(i))
                r.preventDefault();
            else {
                var o = Input.getBind(i);
                if (!E(i))
                    return null == f[o] ? (n[i] || (n[i] = !0,
                    UI.controlKey(i, o, !0)),
                    r.preventDefault(),
                    !1) : (e[o] || (e[o] = !0,
                    C(o)),
                    t[i] || (t[i] = !0),
                    r.preventDefault(),
                    !1)
            }
        }
    }
      , T = function(r) {
        if (game.state == Network.STATE.PLAYING || game.state == Network.STATE.CONNECTING) {
            var i = r.which
              , o = Input.getBind(i);
            if (null == f[o] && n[i] && (n[i] = !1),
            !E(i))
                return e[o] && (e[o] = !1,
                R(o)),
                t[i] && (t[i] = !1),
                r.preventDefault(),
                !1
        }
    }
      , E = function(e, t) {
        return !!UI.chatBoxOpen() && (9 != e && 27 != e && 13 != e && 38 != e && 40 != e && 37 != e && 39 != e && 112 != e && 113 != e && 114 != e && 115 != e && 116 != e && 117 != e && 118 != e && 119 != e && 120 != e && 121 != e && 122 != e && 123 != e)
    }
      , S = function() {
        l = {
            forward: !0,
            left: !1,
            right: !1,
            up: !1,
            down: !1,
            fire: !1,
            special: !1,
            angle: 0,
            force: 0
        }
    };
    Input.toggleKeybinds = function() {
        u ? Input.closeKeybinds() : Input.openKeybinds()
    }
    ,
    Input.getBind = function(e) {
        var t = g[e];
        return null == t ? null : t
    }
    ,
    Input.bindKey = function(e, t, n) {
        null == c && (c = t,
        h = n,
        $(e.target).html("press key"))
    }
    ,
    Input.closeBind = function() {
        null != c && (M(),
        c = null)
    }
    ,
    Input.resetBinds = function() {
        d = JSON.parse(JSON.stringify(p)),
        Tools.removeSetting("keybinds"),
        c = null,
        M()
    }
    ;
    var I = function() {
        if (null != config.settings.keybinds)
            for (var e in config.settings.keybinds)
                d[e] = JSON.parse(JSON.stringify(config.settings.keybinds[e]))
    }
      , P = function(e) {
        var t = y[e];
        if (27 == e && (t = ""),
        null != t) {
            for (var n in d)
                d[n][0] == t && (d[n][0] = ""),
                d[n].length > 1 && d[n][1] == t && (d[n][1] = "");
            d[c][h] = t;
            for (n in d)
                d[n].length > 1 && "" == d[n][0] && "" != d[n][1] && (d[n] = [d[n][1]]),
                2 == d[n].length && "" === d[n][1] && d[n].splice(-1, 1);
            return M(),
            function() {
                var e = {}
                  , t = "";
                for (var n in d)
                    null != p[n] && (t = JSON.stringify(d[n])) !== JSON.stringify(p[n]) && (e[n] = JSON.parse(t));
                Object.keys(e).length > 0 ? Tools.setSettings({
                    keybinds: e
                }) : Tools.removeSetting("keybinds")
            }(),
            c = null,
            !0
        }
        return !1
    }
      , M = function(e) {
        var t = ""
          , n = ""
          , r = ""
          , i = null;
        t += '<div class="left-binds">';
        for (var o = 0; o < v.length; o++)
            null != v[o][0] && ("" != v[o][0] ? (null == (i = d[v[o][1]]) ? (n = "&nbsp;",
            r = "&nbsp;") : ("" == (n = i[0]) && (n = "&nbsp;"),
            "" == (r = 1 == i.length ? "" : i[1]) && (r = "&nbsp;")),
            t += '<div class="item"><div class="name">' + v[o][0] + '</div><div class="bind' + ("&nbsp;" == n ? " blank" : "") + '" onclick="Input.bindKey(event,\'' + v[o][1] + "',0)\">" + n + '</div><div class="bind' + ("&nbsp;" == r ? " blank" : "") + '" onclick="Input.bindKey(event,\'' + v[o][1] + "',1)\">" + r + "</div></div>",
            13 == o && (t += '</div><div class="right-binds">')) : t += '<div class="item empty"></div>');
        t += "</div>",
        null == e && $("#keybinds-list").html(t),
        g = {};
        o = 0;
        var s = 0;
        for (var a in d) {
            for (o = 0; o < d[a].length; o++)
                null != (s = b[d[a][o]]) && (g[s] = a);
            null != m[a] && $("#keybind-" + a.toLowerCase()).html("" == d[a] ? "&nbsp;" : "(" + d[a] + ")")
        }
    };
    Input.openKeybinds = function() {
        config.mobile || u || (UI.closeAllPanels("keybinds"),
        M(),
        UI.showPanel("#keybinds"),
        u = !0)
    }
    ,
    Input.closeKeybinds = function() {
        u && (UI.hidePanel("#keybinds", u),
        u = !1,
        c = null)
    }
    ,
    Input.update = function() {
        if (a && null != navigator.getGamepads) {
            var e = navigator.getGamepads();
            if (null != e && null != e.length && 0 != e.length && null != e[0]) {
                var t = e[0];
                if (!(t.buttons.length < 16)) {
                    var n = t.buttons[12].pressed
                      , r = t.buttons[13].pressed
                      , i = t.buttons[15].pressed
                      , s = t.buttons[14].pressed
                      , u = t.buttons[0].pressed || t.buttons[2].pressed
                      , c = t.buttons[1].pressed || t.buttons[3].pressed;
                    l.up != n && (A("UP", n),
                    l.up = n),
                    l.down != r && (A("DOWN", r),
                    l.down = r),
                    l.right != i && (A("RIGHT", i),
                    l.right = i),
                    l.left != s && (A("LEFT", s),
                    l.left = s),
                    l.fire != u && (A("FIRE", u),
                    l.fire = u),
                    l.special != c && (A("SPECIAL", c),
                    l.special = c);
                    var h = new Vector(t.axes[1],t.axes[0])
                      , d = h.length()
                      , p = -h.angle() + Math.PI / 2
                      , f = p = (p % o + o) % o;
                    d > .2 ? (l.forward = !0,
                    O(f, d)) : (l.forward && !n && A("UP", !1),
                    l.forward = !1)
                }
            } else
                a = !1
        }
    }
    ,
    Input.unpressKey = function(e) {
        delete n[e]
    }
    ,
    Input.keyState = function(t) {
        return e[t]
    }
    ,
    Input.clearKeys = function(n) {
        if (game.state === Network.STATE.PLAYING) {
            for (var r of _)
                if (e[r]) {
                    if (n && (t[38] || t[40] || t[37] || t[39]))
                        continue;
                    e[r] = !1,
                    R(r)
                }
            for (var i in t)
                (!n || 38 != i && 40 != i && 37 != i && 39 != i) && (t[i] = !1)
        }
    }
    ,
    Input.touchCloseAll = function() {
        game.state == Network.STATE.LOGIN ? (Games.closeDropdowns(),
        UI.closeLogin()) : game.state == Network.STATE.PLAYING && (UI.closeAllPanels(),
        UI.closeTooltip())
    }
    ,
    Input.addTouchRejection = function(e) {
        $(e).on("touchstart", function(e) {
            e.stopPropagation()
        }),
        $(e).on("touchmove", function(e) {
            e.preventDefault(),
            e.stopPropagation()
        })
    }
    ,
    Input.setupLogin = function() {
        $(window).on("touchstart", function(e) {
            Input.touchCloseAll(),
            e.preventDefault()
        }),
        Input.addTouchRejection("#logon,#big-message,#loginselector")
    }
    ,
    Input.setupTouch = function() {
        $(window).on("touchcancel", function(e) {
            null != s && s.processOnEnd(e)
        });
        Input.addTouchRejection("#settings,#sidebar,#roomnamecontainer,#menu,#gameselector,#mainmenu,#scoredetailed,#invitefriends,#msg-alert,#msg-information");
        $("body").append('<div id="touch-joystick"></div><div id="touch-fire"><div class="circle"></div></div><div id="touch-special"><div class="circle"></div></div>'),
        $("#touch-fire").on("touchstart", function(e) {
            A("FIRE", !0),
            $("#touch-fire > .circle").css({
                "background-color": "rgba(255, 255, 255, 0.5)"
            }),
            e.preventDefault()
        }),
        $("#touch-fire").on("touchend", function(e) {
            A("FIRE", !1),
            $("#touch-fire > .circle").css({
                "background-color": "rgba(255, 255, 255, 0.2)"
            }),
            e.preventDefault()
        }),
        $("#touch-special").on("touchstart", function(e) {
            A("SPECIAL", !0),
            $("#touch-special > .circle").css({
                "background-color": "rgba(255, 255, 255, 0.5)"
            }),
            e.preventDefault()
        }),
        $("#touch-special").on("touchend", function(e) {
            A("SPECIAL", !1),
            $("#touch-special > .circle").css({
                "background-color": "rgba(255, 255, 255, 0.2)"
            }),
            e.preventDefault()
        });
        var e = {
            zone: $("#touch-joystick")[0],
            mode: "static",
            position: {
                bottom: "50%",
                left: "50%"
            }
        };
        (s = nipplejs.create(e)).on("end", Input.touchEnd),
        s.on("move", Input.touchMove)
    }
    ,
    Input.toggleMouse = function(e) {
        if (!config.mobile)
            if ($(window).off("mousedown"),
            $(window).off("mouseup"),
            config.mouse = !config.mouse,
            config.mouse) {
                if ($(window).on("mousedown", Input.mouseDown),
                $(window).on("mouseup", Input.mouseUp),
                e)
                    return;
                UI.showMessage("alert", '<span class="info">MOUSE MODE</span>Enabled<div class="mousemode"><span class="info">LEFT CLICK</span>Fire&nbsp;&nbsp;&nbsp;<span class="info">RIGHT CLICK</span>Special&nbsp;&nbsp;&nbsp;<span class="info">WASD</span>Move</div>', 7e3),
                Tools.setSettings({
                    mousemode: !0
                })
            } else
                UI.showMessage("alert", '<span class="info">MOUSE MODE</span>Disabled', 3e3),
                Tools.removeSetting("mousemode")
    }
    ,
    Input.mouseDown = function(e) {
        var t = e.originalEvent;
        if ((0 == t.button || 2 == t.button) && null != t.target.tagName && "canvas" == t.target.tagName.toLowerCase()) {
            var n = 0 == t.button ? "FIRE" : "SPECIAL";
            A(n, !0),
            e.preventDefault()
        }
    }
    ,
    Input.mouseUp = function(e) {
        var t = e.originalEvent;
        if (0 == t.button || 2 == t.button)
            if (null != t.target.tagName && "canvas" == t.target.tagName.toLowerCase()) {
                var n = 0 == t.button ? "FIRE" : "SPECIAL";
                A(n, !1),
                e.preventDefault()
            } else
                A("FIRE", !1),
                A("SPECIAL", !1)
    }
    ;
    var A = function(t, n) {
        (e[t] == !n || n && null == e[t]) && (Network.sendKey(t, n),
        e[t] = n)
    }
      , O = function(e, t) {
        var n = Players.getMe();
        if (null != n) {
            var o = e - n.rot;
            o > Math.PI && (o -= 2 * Math.PI),
            o < -Math.PI && (o += 2 * Math.PI);
            var s = Math.round(Math.abs(o) / (60 * config.ships[n.type].turnFactor) * 1e3);
            if (!((s -= Math.round(game.ping)) < 10 || game.time - i < 100)) {
                null != r && clearTimeout(r),
                i = game.time;
                var a = o > 0 ? "RIGHT" : "LEFT"
                  , l = o <= 0 ? "RIGHT" : "LEFT";
                A("UP", !(null != t && t < .5)),
                A(a, !0),
                A(l, !1),
                r = setTimeout(function() {
                    A(a, !1)
                }, s)
            }
        }
    };
    Input.touchMove = function(e, t) {
        var n = -t.angle.radian + Math.PI / 2
          , r = n = (n % o + o) % o;
        O(r, t.force)
    }
    ,
    Input.touchEnd = function(e, t) {
        A("UP", !1),
        A("LEFT", !1),
        A("RIGHT", !1)
    }
    ,
    Input.gameFocus = function() {
        game.focus = !0
    }
    ,
    Input.gameBlur = function() {
        game.focus = !1,
        Input.clearKeys()
    }
    ;
    var C = function(e) {
        if (3 == game.myType && ("STRAFELEFT" === e || "STRAFERIGHT" === e))
            return C("SPECIAL"),
            void C("STRAFELEFT" === e ? "LEFT" : "RIGHT");
        -1 !== x.indexOf(e) && Network.sendKey(e, !0)
    }
      , R = function(t) {
        if (3 != game.myType || "STRAFELEFT" !== t && "STRAFERIGHT" !== t)
            -1 !== _.indexOf(t) && Network.sendKey(t, !1);
        else {
            R("STRAFELEFT" === t ? "LEFT" : "RIGHT");
            e["STRAFERIGHT" === t ? "STRAFELEFT" : "STRAFERIGHT"] || R("SPECIAL")
        }
    }
})();




// class Mob 

class Mob {
    constructor(e, playerID/**mod**/) {
		this.playerID = playerID;/**mod**/
        this.id = e.id,
        this.type = e.type,
        this.pos = new Vector(e.posX,e.posY),
        this.spriteRot = 0,
        this.missile = 1 == this.type || 2 == this.type || 3 == this.type || 5 == this.type || 6 == this.type || 7 == this.type,
        this.missile && e.c !== Network.SERVERPACKET.MOB_UPDATE_STATIONARY ? (this.speed = new Vector(e.speedX,e.speedY),
        this.accel = new Vector(e.accelX,e.accelY),
        this.maxSpeed = e.maxSpeed,
        this.exhaust = config.mobs[this.type].exhaust,
        this.lastAccelX = 0,
        this.lastAccelY = 0,
        this.stationary = !1,
        this.spriteRot = this.speed.angle() + Math.PI) : this.stationary = !0,
        this.sprites = {},
        this.state = {
            inactive: !1,
            despawnTicker: 0,
            despawnType: 0,
            baseScale: 1,
            baseScaleShadow: 1,
            luminosity: 1
        },
        this.randomness = Tools.rand(0, 1e5),
        this.culled = !1,
        this.visibility = !0,
        this.reducedFactor = !1,
        this.forDeletion = !1,
        this.spawnTime = game.time,
        this.lastPacket = game.timeNetwork;
        //,this.setupSprite()
		//if (Bot.ready) {
			//Bot.heartbeat();
		//}
    }
    setupSprite() {
        switch (4 != this.type && 8 != this.type && 9 != this.type && (this.sprites.thrusterGlow = Textures.init("thrusterGlowSmall", {
            layer: "projectiles"
        }),
        this.sprites.smokeGlow = Textures.init("smokeGlow", {
            layer: "projectiles"
        }),
        this.sprites.thruster = Textures.init("missileThruster")),
        this.type) {
        case 1:
        case 5:
        case 6:
        case 7:
            this.sprites.sprite = Textures.init("missile"),
            this.sprites.shadow = Textures.init("missileShadow", {
                scale: [.25, .2]
            }),
            this.sprites.thrusterGlow.scale.set(3, 2),
            this.sprites.thrusterGlow.alpha = .2,
            this.sprites.smokeGlow.scale.set(1.5, 3),
            this.sprites.smokeGlow.alpha = .75;
            break;
        case 2:
            this.sprites.sprite = Textures.init("missileFat"),
            this.sprites.shadow = Textures.init("missileShadow", {
                scale: [.5, .25]
            }),
            this.sprites.thrusterGlow.scale.set(4, 3),
            this.sprites.thrusterGlow.alpha = .25,
            this.sprites.smokeGlow.scale.set(2.5, 3),
            this.sprites.smokeGlow.alpha = .75;
            break;
        case 3:
            this.sprites.sprite = Textures.init("missileSmall", {
                scale: [.28, .2]
            }),
            this.sprites.shadow = Textures.init("missileShadow", {
                scale: [.18, .14]
            }),
            this.sprites.thrusterGlow.scale.set(3, 2),
            this.sprites.thrusterGlow.alpha = .2,
            this.sprites.smokeGlow.scale.set(1, 2),
            this.sprites.smokeGlow.alpha = .75;
            break;
        case 4:
        case 8:
        case 9:
            var e = "crateUpgrade";
            8 == this.type ? e = "crateShield" : 9 == this.type && (e = "crateRampage"),
            this.state.baseScale = .33,
            this.state.baseScaleShadow = 2.4 / config.shadowScaling * .33,
            this.sprites.sprite = Textures.init(e, {
                scale: this.state.baseScale
            }),
            this.sprites.shadow = Textures.init("crateShadow", {
                scale: this.state.baseScaleShadow
            })
        }
    }
    despawn(e) {
        if (4 == this.type || 8 == this.type || 9 == this.type)
            return this.state.inactive = !0,
            this.state.despawnTicker = 0,
            this.state.despawnType = e,
            void (1 == e && 4 != this.type /*&& Sound.powerup(this.type, this.pos)*/);
        this.state.inactive = !0,
        this.state.despawnTicker = 0,
        //this.sprites.thruster.renderable = !1,
        //this.sprites.thrusterGlow.renderable = !1,
        //this.sprites.smokeGlow.renderable = !1,
        this.accel.x = 0,
        this.accel.y = 0/*,
        this.missile && Sound.updateThruster(1, this, !1)*/
    }
    destroy(e) {
        switch (this.type) {
        case 1:
        case 2:
        case 3:
        case 5:
        case 6:
        case 7:
            //game.graphics.layers.projectiles.removeChild(this.sprites.sprite),
            //game.graphics.layers.shadows.removeChild(this.sprites.shadow),
            //game.graphics.layers.thrusters.removeChild(this.sprites.thruster),
            //game.graphics.layers.projectiles.removeChild(this.sprites.thrusterGlow),
            //game.graphics.layers.projectiles.removeChild(this.sprites.smokeGlow),
            //this.sprites.sprite.destroy(),
            //this.sprites.shadow.destroy(),
            //this.sprites.thruster.destroy(),
            //this.sprites.thrusterGlow.destroy(),
            //this.sprites.smokeGlow.destroy();
            break;
        case 4:
        case 8:
        case 9:
            //game.graphics.layers.crates.removeChild(this.sprites.sprite),
            //game.graphics.layers.shadows.removeChild(this.sprites.shadow)
        }
		//if (this.missile)
			//console.log("e____", this.pos, e);
        e.c === Network.SERVERPACKET.MOB_DESPAWN_COORDS && (Mobs.explosion(this.pos, e.type),
        this.missile && Sound.updateThruster(1, this, !1))
    }
    network(e) {
        this.lastPacket = game.timeNetwork,
        e.c === Network.SERVERPACKET.MOB_UPDATE && (this.reducedFactor = Tools.reducedFactor()),
        this.pos.x = e.posX,
        this.pos.y = e.posY,
        null != e.speedX && (this.speed.x = e.speedX,
        this.speed.y = e.speedY),
        null != e.accelX && (this.accel.x = e.accelX,
        this.accel.y = e.accelY)
    }
    visible(e) {
        //e == this.visibility && e != this.culled || (this.sprites.sprite.visible = e,
        //this.sprites.shadow.visible = e,
        //4 != this.type && 8 != this.type && 9 != this.type && (this.sprites.thruster.visible = e,
        //this.sprites.thrusterGlow.visible = e),
        //this.visibility = e)
    }
    visibilityUpdate() {
        this.culled = !Graphics.inScreen(this.pos, 128),
        this.visible(!this.culled)
    }
    update(e) {
        if (this.visibilityUpdate(),
        !(!1 !== this.reducedFactor && (e -= this.reducedFactor,
        this.reducedFactor = !1,
        e <= 0))) {
            var t, n, r, i = e > .51 ? Math.round(e) : 1, o = e / i;
            for (t = 0; t < i; t++)
                if (this.stationary){
                    this.clientCalcs(o);
					//console.log("___", this,id, this.pos);
				}else {
                    n = this.speed.x,
                    r = this.speed.y,
                    this.speed.x += this.accel.x * o,
                    this.speed.y += this.accel.y * o;
                    var s = this.speed.length();
                    s > this.maxSpeed && this.speed.multiply(this.maxSpeed / s),
                    this.state.inactive && this.speed.multiply(1 - .03 * o),
                    this.pos.x += o * n + .5 * (this.speed.x - n) * o,
                    this.pos.y += o * r + .5 * (this.speed.y - r) * o,
                    this.pos.x < -16384 && (this.pos.x += 32768),
                    this.pos.x > 16384 && (this.pos.x -= 32768),
                    this.pos.y < -8192 && (this.pos.y += 16384),
                    this.pos.y > 8192 && (this.pos.y -= 16384),
                    this.clientCalcs(o)
					//,console.log("__", this.pos);
                }
            this.missile && !this.state.inactive && Sound.updateThruster(1, this, this.visibility)
        }
    }
    clientCalcs(e) {
        if (!this.forDeletion)
            switch (this.state.luminosity -= .075 * e,
            this.state.luminosity < 0 && (this.state.luminosity = 0),
            this.type) {
            case 1:
            case 2:
            case 3:
            case 5:
            case 6:
            case 7:
                var t = 1;
                if (this.state.inactive) {
                    if (this.state.despawnTicker += .01 * e,
                    this.state.despawnTicker > .75) {
                        var n = 1 - 4 * (this.state.despawnTicker - .75);
                        //this.sprites.sprite.alpha = n,
                        //this.sprites.shadow.alpha = n
                    }
                    if (this.state.despawnTicker > 1)
                        return void (this.forDeletion = !0);
                    t = Tools.clamp(1 - this.state.despawnTicker, .3, 1)
                }
                if (!this.culled && t > .3) {
                    var r = this.speed.angle() + Math.PI;
                    r - this.spriteRot >= Math.PI ? this.spriteRot += 2 * Math.PI : this.spriteRot - r > Math.PI && (this.spriteRot -= 2 * Math.PI),
                    this.spriteRot = Tools.converge(this.spriteRot, r, .1 * e)
                    //,Particles.missileSmoke(this, this.exhaust, t)
                }
                break;
            case 4:
            case 8:
            case 9:
                if (this.state.inactive && (this.state.despawnTicker += .05 * e,
                this.state.despawnTicker > 1))
                    return void (this.forDeletion = !0)
            }
    }
    updateGraphics(e) {
		//if (this.missile)
			//console.log("q____", this.pos);
		return;
        switch (this.type) {
        case 1:
        case 2:
        case 3:
        case 5:
        case 6:
        case 7:
            var t = Graphics.shadowCoords(this.pos)
              , n = Tools.oscillator(.1, .5, this.randomness)
              , r = Tools.oscillator(.15, 10, this.randomness);
            //Graphics.transform(this.sprites.sprite, this.pos.x, this.pos.y, this.spriteRot),
            //Graphics.transform(this.sprites.shadow, t.x, t.y, this.spriteRot),
            //Graphics.transform(this.sprites.thrusterGlow, this.pos.x + Math.sin(-this.spriteRot) * (this.exhaust + 20), this.pos.y + Math.cos(-this.spriteRot) * (this.exhaust + 20), null, null, null, (.5 * this.state.luminosity + .2) * r),
            //Graphics.transform(this.sprites.smokeGlow, this.pos.x + Math.sin(-this.spriteRot) * (this.exhaust + 20), this.pos.y + Math.cos(-this.spriteRot) * (this.exhaust + 20), this.spriteRot),
            //Graphics.transform(this.sprites.thruster, this.pos.x + Math.sin(-this.spriteRot) * this.exhaust, this.pos.y + Math.cos(-this.spriteRot) * this.exhaust, this.spriteRot, config.mobs[this.type].thruster[0] * n, config.mobs[this.type].thruster[1] * n);
            break;
        case 4:
        case 8:
        case 9:
            var i;
            t = Graphics.shadowCoords(this.pos);
            i = 0 == this.state.despawnType ? 1 - this.state.despawnTicker : 1 + 2 * this.state.despawnTicker,
            i *= Tools.oscillator(.08, 500, this.randomness)
            //,Graphics.transform(this.sprites.sprite, this.pos.x, this.pos.y + 20 * (Tools.oscillator(.08, 330, this.randomness) - 1.04), null, this.state.baseScale * i, this.state.baseScale * i, 1 - this.state.despawnTicker),
            //Graphics.transform(this.sprites.shadow, t.x, t.y, null, this.state.baseScaleShadow * i, this.state.baseScaleShadow * i, 1 - this.state.despawnTicker)
        }
    }
}
(function() {
    var e = {}
      , t = []
      , n = {};
	/**mod**/
	Mobs.mobs = function(){
		return e;
	};
	/**/
    Mobs.add = function(t, n, playerID/**mod**/) {
		//console.log(1, t);
        e[t.id] = new Mob(t, playerID),
        n && e[t.id].network(t)
    }
	Mobs.get = function(t){
		return e[t]
	}
    ,
    Mobs.update = function() {
        var t, n;
        for (t in e)
            (n = e[t]).update(game.timeFactor),
            n.forDeletion ? Mobs.destroy(n) : n.updateGraphics(game.timeFactor)
    }
    ,
    Mobs.network = function(t, playerID/**mod (see Network.force..)**/) {
		//console.log(2, t, playerID);
        var n = e[t.id];
        //null == n ? Mobs.add(t, !0) : n.network(t)
		if (null == n){
			Mobs.add(t, !0);
		} else {
			n.playerID = playerID;/**mod**/
			n.network(t);
		}
    }
    ,
    Mobs.despawn = function(t) {
		//console.log(3, t);
        var n = e[t.id];
        null != n && n.despawn(t.type)
    }
    ,
    Mobs.destroy = function(t) {
		//console.log(4, t);
        var n = e[t.id];
        null != n && (n.destroy(t),
        delete e[t.id])
    }
    ,
    Mobs.explosion = function(e, t) {
        //switch (t) {
        //case 1:
        //case 5:
        //case 6:
        //case 7:
            //Particles.explosion(e, Tools.rand(1, 1.2));
            //break;
        //case 2:
            //Particles.explosion(e, Tools.rand(1.3, 1.6));
            //break;
        //case 3:
            //Particles.explosion(e, Tools.rand(.8, 1))
        //}
        //Sound.mobExplosion(e, t)
    }
    ,
    Mobs.count = function() {
        var t, n = 0, r = 0;
        for (t in e)
            n++,
            e[t].culled && r++;
        return [n - r, n]
    }
    ,
    Mobs.wipe = function() {
        for (var t in e)
            e[t].destroy({}),
            delete e[t]
    }
    ,
    Mobs.countDoodads = function() {
        return [t.length, config.doodads.length]
    }
    ,
    Mobs.setupDoodads = function() {
        config.doodads = config.doodads.concat(config.groundDoodads);
        for (var e = 0; e < config.doodads.length; e++)
            Mobs.addDoodad(config.doodads[e])
    }
    ,
    Mobs.addDoodad = function(e) {
        var t = Number.isInteger(e[2])
          , n = Textures.init((t ? "mountain" : "") + e[2]);
        n.scale.set(e[3]),
        n.position.set(e[0], e[1]),
        n.visible = !1,
        e[4] && (n.rotation = e[4]),
        e[5] && (n.alpha = e[5]),
        e[6] && (n.tint = e[6]),
        e[7] = !1,
        e[8] = n,
        e[9] = t ? 0 : 1
    }
    ,
    Mobs.getClosestDoodad = function(e) {
        for (var n, r, i = 2, o = 0; o < t.length; o++)
            0 == (r = t[o])[5] && Tools.distFastCheckFloat(e.x, e.y, r[0], r[1], 256 * r[3]) && (n = Tools.distance(e.x, e.y, r[0], r[1]) / (256 * r[3])) < i && (i = n);
        return Tools.clamp(3.333 * (i - .5), .2, 1)
    }
    ,
    Mobs.updateDoodads = function() {
        for (var e, r = Tools.getBucketBounds(Graphics.getCamera(), 512 + game.halfScreenX / game.scale, 512 + game.halfScreenY / game.scale), i = r[0]; i <= r[1]; i++)
            for (var o = r[2]; o <= r[3]; o++)
                for (var s = 0; s < game.buckets[i][o][0].length; s++)
                    a = game.buckets[i][o][0][s],
                    e = config.doodads[a],
                    game.state == Network.STATE.LOGIN && 0 != e[9] || Graphics.inScreen(new Vector(e[0],e[1]), 256 * e[3] + config.overdraw) && (e[7] || (e[8].visible = !0,
                    e[7] = !0,
                    n[a] || (n[a] = !0,
                    t.push([e[0], e[1], e[2], e[3], a, e[9]]))));
        for (var a, l = t.length - 1; l >= 0; l--)
            a = t[l][4],
            e = config.doodads[a],
            Graphics.inScreen(new Vector(e[0],e[1]), 256 * e[3] + config.overdraw) || e[7] && (e[8].visible = !1,
            e[7] = !1,
            t.splice(l, 1),
            delete n[a])
    }
})();




// Games

(function() {
    var e = !1
      , t = !1
      , n = !1
      , r = ["", "Free For All", "Capture The Flag", "Battle Royale"]
      , i = ["", "ffa", "ctf", "br"]
      , o = 0
      , s = {}
      , a = 0
      , l = null
      , u = null
      , c = !1
      , h = !1
      , d = null
      , p = []
      , f = !1
      , g = {}
      , m = {}
      , v = null
      , y = !1
      , b = {
        radius: 0,
        pos: Vector.zero(),
        speed: 0
    }
      , _ = {
        2: "Custom country flags",
        3: "Emotes",
        4: "Flag Pack #1"
    };
    Games.setup = function() {
        $("#playregion").on("click", function(e) {
            Games.updateRegion(!0, e)
        }),
        $("#playtype").on("click", function(e) {
            Games.updateType(!0, e)
        }),
        $("#open-menu").on("click", function(e) {
            Games.popGames(),
            e.stopPropagation()
        }),
        $("#gameselector").on("click", function(e) {
            e.stopPropagation()
        }),
        $("#invite-copy").on("click", Games.copyInviteLink),
        $("#loginbutton").on("click", function(e) {
            UI.openLogin(),
            e.stopPropagation()
        }),
        $("#login-facebook").on("click", function() {
            Games.popupLogin(1)
        }),
        $("#login-google").on("click", function() {
            Games.popupLogin(2)
        }),
        $("#login-twitter").on("click", function() {
            Games.popupLogin(3)
        }),
        $("#login-reddit").on("click", function() {
            Games.popupLogin(4)
        }),
        $("#login-twitch").on("click", function() {
            Games.popupLogin(5)
        }),
        $("#loginselector").on("click", function(e) {
            e.stopPropagation()
        }),
        $("#gotomainpage").on("click", Games.redirRoot),
        $("#lifetime-signin").on("click", Games.redirRoot),
        null != config.settings.session ? Games.playerAuth() : Games.playerGuest(),
        w(function() {
            if (h = !0,
            T(),
            DEVELOPMENT && "#tony" == window.location.hash)
                return game.playRegion = "eu",
                game.playRoom = "ffa1",
                game.playInvited = !0,
                game.myOriginalName = window.location.hash.substr(1),
                void Games.start(game.myOriginalName, !0);
            f || (I(),
            Games.updateRegion(!1),
            Games.updateType(!1),
            C())
        }, !0)
    }
    ,
    Games.popupLogin = function(e) {
        x("/auth_" + ["", "facebook", "google", "twitter", "reddit", "twitch"][e], "Login", 4 == e ? 900 : 500, 500)
    }
    ;
    var x = function(e, t, n, r) {
        var i = void 0 != window.screenLeft ? window.screenLeft : window.screenX
          , o = void 0 != window.screenTop ? window.screenTop : window.screenY
          , s = (window.innerWidth ? window.innerWidth : document.documentElement.clientWidth ? document.documentElement.clientWidth : screen.width) / 2 - n / 2 + i
          , a = (window.innerHeight ? window.innerHeight : document.documentElement.clientHeight ? document.documentElement.clientHeight : screen.height) / 2 - r / 2 + o;
        window.open(e, t, "width=" + n + ", height=" + r + ", top=" + a + ", left=" + s)
    };
    //window.loginSuccess = function(e) {
        //config.settings.session = e,
        //Tools.setSettings({
            //session: e
        //}),
        //Tools.removeSetting("flag"),
        //Games.playerAuth(),
        //UI.closeLogin()
    //}
    //,
    //window.loginFailure = function() {}
    //,
    Games.playerGuest = function() {
        UI.show("#playbutton", !0),
        UI.show("#loginbutton", !0)
    }
    ,
    Games.playerAuth = function() {
        Tools.ajaxPost("/auth", {
            session: config.settings.session
        }, function(e) {
            if (null != e) {
                game.loggedIn = !0,
                game.myUserID = e.user;
                var t = UI.escapeHTML(e.authName.substr(0, 30)) + '<span class="grey">(' + ["", "Facebook", "Google", "Twitter", "Reddit", "Twitch"][e.authType] + ")</span>"
                  , n = t + '<span class="link" onclick="Games.logout()">Logout</span>'
                  , r = "Logged in as " + t + '<span class="button" onclick="Games.logout()">LOG OUT</span>';
                null != e.name && $("#playername").val(e.name),
                $("#logout").html(n),
                $("#logout-mainmenu").html(r),
                $("#loginbutton").remove(),
                $("#lifetime-account").remove(),
                $("#playbutton").html("PLAY"),
                UI.show("#playbutton", !0)
            } else
                Games.playerGuest()
        })
    }
    ,
    Games.logout = function() {
        Tools.removeSetting("session"),
        Tools.removeSetting("name"),
        Tools.removeSetting("flag"),
        window.location = "/"
    }
    ;
    var w = function(e, t) {
        var n = "/games";
        t && (n += "?main=1"),
        $.ajax({
            url: n,
            dataType: "json",
            cache: !1,
            success: function(n) {
                try {
                    p = JSON.parse(n.data)
                } catch (e) {
                    return
                }
                if ("xx" == game.myFlag && (game.myFlag = n.country),
                t && game.protocol != n.protocol) {
                    if ("#reload" !== window.location.hash)
                        return void Tools.ajaxPost("/clienterror", {
                            type: "protocol"
                        }, function(e) {
                            UI.showMessage("alert", '<span class="mainerror">Protocol update<br>Your client is being updated to the new version</span>', 3e4),
                            setTimeout(function() {
                                window.location = "/?" + Tools.randomID(10) + "#reload"
                            }, 5e3)
                        });
                    Tools.ajaxPost("/clienterror", {
                        type: "protocolretry"
                    })
                }
                e()
            },
            error: function() {}
        })
    }
      , T = function() {
        o = 0;
        for (var e = 0, t = 0; t < p.length; t++)
            for (var n = 0; n < p[t].games.length; n++)
                o += p[t].games[n].players,
                e++;
        if (0 == e)
            f = !0,
            UI.showMessage("alert", '<span class="mainerror">We are currently performing server maintenance<br>Please try again in a few minutes</span>', 3e4);
        else {
            var r = '<div class="item smallerpad">' + o + "</div>player" + (o > 1 ? "s" : "") + " online";
            $("#gameinfo").html(r)
        }
    }
      , E = function(e) {
        if ("closest" === e)
            return {
                name: "Closest"
            };
        for (var t = 0; t < p.length; t++)
            if (p[t].id === e)
                return p[t];
        return game.playRegion = "closest",
        {
            name: "Closest"
        }
    }
      , S = function(e, t) {
        var n = E(e);
        if (null == n)
            return null;
        if (null == n.games)
            return null;
        for (var o = 0; o < n.games.length; o++)
            if (n.games[o].id === t)
                return n.games[o];
        var s = i.indexOf(t);
        if (-1 != s)
            for (o = 0; o < n.games.length; o++)
                if (n.games[o].type == s)
                    return {
                        name: r[s]
                    };
        return null
    }
      , I = function() {
        var e = window.location.hash;
        if (history.replaceState(null, null, "/"),
        "#reload" !== e && null != e && !(e.length < 4 || e.length > 20)) {
            var t = (e = e.substr(1)).indexOf("-");
            if (-1 != t) {
                var n = e.substr(0, t)
                  , r = e.substr(t + 1);
                null != S(n, r) && (game.playRegion = n,
                game.playRoom = r,
                game.playInvited = !0)
            }
        }
    };
    Games.selectRegion = function(e, t) {
        e.stopPropagation(),
        Sound.UIClick(),
        game.playRegion = t,
        Games.updateRegion(!1),
        Games.updateType()
    }
    ,
    Games.selectGame = function(e, t) {
        e.stopPropagation(),
        Sound.UIClick(),
        game.playRoom = t,
        Games.updateType(!1)
    }
    ,
    Games.closeDropdowns = function() {
        t && Games.updateType(!1),
        e && Games.updateRegion(!1)
    }
    ,
    Games.updateRegion = function(n, r) {
        var i = ""
          , o = null;
        if (h && !f) {
            if (null != r && (r.stopPropagation(),
            e || Sound.UIClick()),
            n && UI.closeLogin(),
            null == n && (n = e),
            n) {
                t && Games.updateType(!1),
                i += '<div class="item"><div class="region header">REGION</div><div class="players header">PLAYERS</div><div class="ping header">PING</div><div class="clear"></div></div>';
                var s = "";
                null != u && (s = '<span class="autoregion">(' + p[u].name + ")</span>"),
                i += '<div class="item selectable' + ("closest" === game.playRegion ? " sel" : "") + '" onclick="Games.selectRegion(event, &quot;closest&quot;)"><div class="region chooser">Closest' + s + '</div><div class="clear"></div></div>';
                for (var a = 0; a < p.length; a++) {
                    for (var l = 0, c = 0; c < p[a].games.length; c++)
                        l += p[a].games[c].players;
                    var d;
                    d = null == p[a].ping ? "&nbsp;" : Math.round(p[a].ping) + '<span class="ms">ms</span>',
                    i += '<div class="item selectable' + (game.playRegion === p[a].id ? " sel" : "") + '" onclick="Games.selectRegion(event, &quot;' + p[a].id + '&quot;)"><div class="region chooser">' + p[a].name + '</div><div class="players number">' + l + '</div><div class="ping chooser nopadding">' + d + '</div><div class="clear"></div></div>'
                }
                i += '<div class="item"></div>',
                o = {
                    width: "240px",
                    height: "auto",
                    "z-index": "2"
                },
                $("#playregion").removeClass("hoverable")
            } else {
                i += '<div class="arrowdown"></div>',
                i += '<div class="playtop">REGION</div>';
                i += '<div class="playbottom">' + E(game.playRegion).name + "</div>",
                o = {
                    width: "130px",
                    height: "40px",
                    "z-index": "auto"
                },
                $("#playregion").addClass("hoverable")
            }
            $("#playregion").html(i),
            $("#playregion").css(o),
            e = n
        }
    }
    ;
    var P = function() {
        var e = game.playRegion;
        if ("closest" === e) {
            if (null == u)
                return null;
            e = p[u].id
        }
        return e
    }
      , M = function(e) {
        var t = '<div class="infott">';
        return 1 == e ? t += "Everyone versus everyone deathmatch. No teams." : 2 == e ? t += "Players split into 2 teams. 2 flags are placed inside each base. The objective is to move the enemy flag from their base to your base." : 3 == e && (t += "Players spawn at random locations all across the map. Destroyed players will not respawn. Last player standing wins."),
        t += '<div class="arrow"></div></div>'
    };
    Games.updateType = function(n, o) {
        var s = ""
          , a = null;
        if (h && !f) {
            if (null != o && (o.stopPropagation(),
            t || Sound.UIClick()),
            n && UI.closeLogin(),
            null == n && (n = t),
            n) {
                e && Games.updateRegion(!1),
                s += '<div class="item"><div class="gametype header">GAME</div><div class="players header">PLAYERS</div><div class="clear"></div></div>';
                if (null == (p = P()))
                    return;
                null == S(p, game.playRoom) && (game.playRoom = i[1]);
                var l, u, c = E(p).games, d = [[], [], [], [], [], [], [], [], []];
                for (l = 0; l < c.length; l++)
                    d[c[l].type].push(c[l]);
                for (l = 1; l < d.length; l++)
                    if (0 != d[l].length)
                        for (s += '<div class="item selectable' + (i[l] === game.playRoom ? " sel" : "") + '" onclick="Games.selectGame(event, &quot;' + i[l] + '&quot;)"><div class="gametype chooser">' + r[l] + '<span class="infocontainer">&nbsp;<div class="infoicon">' + M(l) + '</div></span></div><div class="clear"></div></div>',
                        u = 0; u < d[l].length; u++)
                            s += '<div class="item selectable' + (d[l][u].id === game.playRoom ? " sel" : "") + '" onclick="Games.selectGame(event, &quot;' + d[l][u].id + '&quot;)"><div class="gametype chooser">' + d[l][u].nameShort + '</div><div class="players number">' + d[l][u].players + '</div><div class="clear"></div></div>';
                s += '<div class="item"></div>',
                a = {
                    width: "240px",
                    height: "auto",
                    "z-index": "2"
                },
                $("#playtype").removeClass("hoverable")
            } else {
                s += '<div class="arrowdown"></div>',
                s += '<div class="playtop">GAME</div>';
                var p;
                if (null == (p = P()))
                    return;
                var g = S(p, game.playRoom);
                null == g ? (name = r[1],
                game.playRoom = i[1]) : name = g.name,
                s += '<div class="playbottom">' + name + "</div>",
                a = {
                    width: "190px",
                    height: "40px",
                    "z-index": "auto"
                },
                $("#playtype").addClass("hoverable")
            }
            $("#playtype").html(s),
            $("#playtype").css(a),
            t = n
        }
    }
    ,
    Games.popGames = function() {
        if (!n) {
            UI.closeAllPanels("games");
            var e = A();
            UI.hide("#menu"),
            $("#gameselector").html(e),
            UI.show("#gameselector"),
            n = !0,
            O(),
            Sound.UIClick()
        }
    }
    ;
    var A = function() {
        var e = "";
        e += '<div class="header">' + game.roomName + '<span class="region">&nbsp;&nbsp;&bull;&nbsp;&nbsp;' + game.regionName + '</span></div><div class="buttons"><div class="button" onclick="Games.redirRoot()">CHANGE REGION</div></div>';
        var t, n, i = E(game.playRegion).games, o = [[], [], [], [], [], [], [], [], []];
        for (t = 0; t < i.length; t++)
            o[i[t].type].push(i[t]);
        var s, a;
        for (t = 1; t < o.length; t++)
            if (0 != o[t].length)
                for (e += '<div class="item head"><div class="gametype chooser section">' + r[t] + '<span class="infocontainer">&nbsp;<div class="infoicon">' + M(t) + '</div></span></div><div class="clear"></div></div>',
                n = 0; n < o[t].length; n++)
                    o[t][n].id === game.playRoom ? (s = " sel",
                    a = "") : (s = " selectable",
                    a = ' onclick="Games.switchGame(&quot;' + o[t][n].id + '&quot;)"'),
                    e += '<div class="item' + s + '"' + a + '><div class="gametype chooser">' + o[t][n].nameShort + '</div><div class="players number">' + o[t][n].players + '</div><div class="clear"></div></div>';
        return e
    };
    Games.redirRoot = function() {
        game.reloading = !0,
        window.location = "/"
    }
    ;
    var O = function() {
        w(function() {
            var e = A();
            $("#gameselector").html(e)
        })
    };
    Games.closeGames = function() {
        n && (UI.hide("#gameselector"),
        UI.show("#menu"),
        n = !1,
        Sound.UIClick())
    }
    ,
    Games.toggleGames = function() {
        n ? Games.closeGames() : Games.popGames()
    }
    ,
    Games.switchGame = function(e) {
        Games.closeGames(),
        null != e && (game.playRoom = e),
        game.myScore = 0,
        game.state = Network.STATE.CONNECTING,
        Network.shutdown(),
        Particles.wipe(),
        Players.wipe(),
        Mobs.wipe(),
        UI.reconnection(),
        Games.start(game.myOriginalName)
    }
    ;
    var C = function() {
        s = {},
        a = 0;
        for (var e, t = 0; t < p.length; t++)
            e = p[t].games[Tools.randInt(0, p[t].games.length - 1)].host,
            null == s[e] && (s[e] = {
                ping: 9999,
                num: 0,
                threshold: 0,
                server: t
            });
        Games.performPing(),
        Games.performPing(),
        Games.performPing(),
        l = setInterval(Games.performPing, 300)
    };
    Games.performPing = function() {
        if (!(a > 3 || c)) {
            var e = 9999
              , t = null;
            for (var n in s)
                s[n].num < e && (e = s[n].num,
                t = n);
            if (e > 6)
                null != l && clearInterval(l);
            else {
                s[t].num++;
                var r;
                r = DEVELOPMENT ? "/ping" : "https://game-" + t + ".airma.sh/ping",
                R(t, r, function() {
                    R(t, r)
                })
            }
        }
    }
    ;
    var R = function(e, t, n) {
        if (null != s[e] && !c) {
            a++;
            var r = performance.now();
            $.ajax({
                url: t,
                dataType: "json",
                cache: !1,
                timeout: 2e3,
                success: function(t) {
                    if (!c && (a--,
                    1 == t.pong && null != s[e])) {
                        var i = performance.now() - r;
                        if (Math.abs(s[e].ping - i) < .1 * i && s[e].threshold++,
                        s[e].threshold >= 2)
                            return i < s[e].ping && (p[s[e].server].ping = i,
                            Games.findClosest(),
                            Games.updateRegion()),
                            void delete s[e];
                        i < s[e].ping && (s[e].ping = i,
                        p[s[e].server].ping = i,
                        Games.findClosest(),
                        Games.updateRegion(),
                        null != n && n())
                    }
                },
                error: function() {
                    a--
                }
            })
        }
    };
    Games.findClosest = function() {
        for (var e = 9999, t = !1, n = 0; n < p.length; n++)
            null != p[n].ping && p[n].ping < e && (e = p[n].ping,
            u = n,
            t = !0);
        t && "closest" === game.playRegion && Games.updateType()
    }
    ,
    Games.highlightInput = function(e) {
        $(e).css({
            transition: "none",
            transform: "scale(1.1)",
            "background-color": "rgb(90, 30, 30)"
        }),
        $(e).width(),
        $(e).css({
            transition: "all 0.5s ease-in-out",
            transform: "scale(1)",
            "background-color": "rgb(30, 30, 30)"
        }),
        setTimeout(function() {
            $(e).focus()
        }, 200)
    }
    ,
    Games.copyInviteLink = function() {
        D(game.inviteLink) && (UI.show("#invite-copied"),
        null != d && clearTimeout(d),
        d = setTimeout(function() {
            UI.hide("#invite-copied")
        }, 2e3))
    }
    ;
    var D = function(e) {
        var t = document.createElement("span");
        t.textContent = e,
        t.style.whiteSpace = "pre";
        var n = document.createElement("iframe");
        n.sandbox = "allow-same-origin",
        document.body.appendChild(n);
        var r = n.contentWindow;
        r.document.body.appendChild(t);
        var i = r.getSelection();
        i || (i = (r = window).getSelection(),
        document.body.appendChild(t));
        var o = r.document.createRange();
        i.removeAllRanges(),
        o.selectNode(t),
        i.addRange(o);
        var s = !1;
        try {
            s = r.document.execCommand("copy")
        } catch (e) {}
        return i.removeAllRanges(),
        t.remove(),
        n.remove(),
        s
    };
    Games.start = function(e, t) {
        if (!(f || t && game.state == Network.STATE.CONNECTING)) {
            var n = game.playRegion
              , r = P();
            if (null != r) {
                game.playRegion = r,
                null != l && clearInterval(l),
                c = !0;
                var o = game.playRoom
                  , s = i.indexOf(o);
                if (-1 != s) {
                    for (var a = E(game.playRegion).games, u = [], h = 0; h < a.length; h++)
                        a[h].type == s && u.push(a[h].id);
                    o = u[Tools.randInt(0, u.length - 1)]
                }
                var d = S(game.playRegion, o);
                game.playHost = d.host,
                game.playPath = d.id,
                game.regionName = E(game.playRegion).name,
                game.playRoom = o,
                game.state == Network.STATE.LOGIN && Tools.wipeReel(),
                game.state = Network.STATE.CONNECTING;
                var p = {
                    name: e
                };
                game.playInvited || (p.region = n),
                Tools.setSettings(p),
                UI.gameStart(e, t),
                t && Tools.ajaxPost("/enter", {
                    id: config.settings.id,
                    name: e,
                    game: game.playRegion + "-" + game.playRoom,
                    source: null != document.referrer ? document.referrer : "",
                    mode: config.mobile ? 1 : 0
                })
            }
        }
    }
    ,
    Games.prep = function() {
        if (Games.wipe(),
        2 == game.gameType) {
            //$("#gamespecific").html('<div class="blueflag"></div><div id="blueflag-name" class="blueflag-player">&nbsp;</div><div class="redflag"></div><div id="redflag-name" class="redflag-player">&nbsp;</div>'),
            //UI.show("#gamespecific"),
			_flag_html = {};
            g = {
                flagBlue: {
                    visible: !1,
                    playerId: null,
                    direction: 1,
                    diffX: 0,
                    momentum: 0,
                    position: Vector.zero(),
                    basePos: new Vector(-9669,-1471),
                    //sprite: Textures.init("ctfFlagBlue", {
                        //scale: .4,
                        //visible: !1
                    //}),
                    //spriteShadow: Textures.init("ctfFlagShadow", {
                        //scale: .4 * 1.1,
                        //visible: !1
                    //}),
                    //minimapSprite: Textures.init("minimapFlagBlue"),
                    //minimapBase: Textures.init("minimapBaseBlue")
                },
                flagRed: {
                    visible: !1,
                    playerId: null,
                    direction: 1,
                    diffX: 0,
                    momentum: 0,
                    position: Vector.zero(),
                    basePos: new Vector(8602,-944),
                    //sprite: Textures.init("ctfFlagRed", {
                        //scale: .4,
                        //visible: !1
                    //}),
                    //spriteShadow: Textures.init("ctfFlagShadow", {
                        //scale: .4 * 1.1,
                        //visible: !1
                    //}),
                    //minimapSprite: Textures.init("minimapFlagRed"),
                    //minimapBase: Textures.init("minimapBaseRed")
                }
            };
			FlagStatus = g;//*mod
			//,
            //Graphics.minimapMob(g.flagBlue.minimapBase, g.flagBlue.basePos.x, g.flagBlue.basePos.y),
            //Graphics.minimapMob(g.flagRed.minimapBase, g.flagRed.basePos.x, g.flagRed.basePos.y)
        } 
		//else
            //3 == game.gameType && ($("#gamespecific").html(""),
            //UI.show("#gamespecific"))
    }
    ,
    Games.wipe = function() {
        //L(),
        //g.flagBlue && g.flagRed && (game.graphics.layers.flags.removeChild(g.flagBlue.sprite),
        //game.graphics.layers.flags.removeChild(g.flagRed.sprite),
        //game.graphics.layers.shadows.removeChild(g.flagBlue.spriteShadow),
        //game.graphics.layers.shadows.removeChild(g.flagRed.spriteShadow),
        //game.graphics.layers.ui3.removeChild(g.flagBlue.minimapSprite),
        //game.graphics.layers.ui3.removeChild(g.flagRed.minimapSprite),
        //game.graphics.layers.ui2.removeChild(g.flagBlue.minimapBase),
        //game.graphics.layers.ui2.removeChild(g.flagRed.minimapBase),
        //g.flagBlue.sprite.destroy(),
        //g.flagRed.sprite.destroy(),
        //g.flagBlue.spriteShadow.destroy(),
        //g.flagRed.spriteShadow.destroy(),
        //g.flagBlue.minimapSprite.destroy(),
        //g.flagRed.minimapSprite.destroy(),
        //g.flagBlue.minimapBase.destroy(),
        //g.flagRed.minimapBase.destroy())
    }
    ,
    Games.networkFlag = function(e) {
        var t = 1 == e.flag ? g.flagBlue : g.flagRed
          , n = 1 == e.flag ? "#blueflag-name" : "#redflag-name"
          , r = 1 == e.flag ? e.blueteam : e.redteam;
        t.momentum = 0,
        t.direction = 1;
        //t.sprite.scale.x = .4,
        //t.sprite.rotation = 0,
        //t.spriteShadow.scale.x = .4 * 1.1,
        //t.spriteShadow.rotation = 0;
        //var i = '<span class="rounds">' + r + '<span class="divider">/</span>3</span>';
		var i = '';
        if (1 == e.type) {
            t.playerId = null,
            t.position.x = e.posX,
            t.position.y = e.posY;
            //t.sprite.position.set(e.posX, e.posY);
            //var o = Graphics.shadowCoords(new Vector(e.posX,e.posY));
            //t.spriteShadow.position.set(o.x, o.y),
            //Graphics.minimapMob(t.minimapSprite, e.posX, e.posY)
			//,$(n).html(i)
        } else {
            t.playerId = e.id;
            var s = Players.get(e.id);
            null != s && (1 == e.flag ? i = /*UI.escapeHTML(*/s.name/*)*/ + i : i += /*UI.escapeHTML(*/s.name/*)*/),
            t.diffX = s.pos.x
			//,$(n).html(i)
        }
		_flag_html[n] = i;
        k(t, !1)
    }
    ;
    var k = function(e, t) {
        //if (t && (Graphics.minimapMob(e.minimapSprite, e.position.x, e.position.y),
			//var _flag_html = {};
        //Graphics.minimapMob(e.minimapBase, e.basePos.x, e.basePos.y)),
        //null != e.playerId) {
            //var n = Players.get(e.playerId);
            //if (null != n && (n.render != e.visible && (e.visible = n.render,
            //e.sprite.visible = n.render,
            //e.spriteShadow.visible = n.render,
            //n.render && (e.momentum = 0,
            //e.direction = 1,
            //e.diffX = n.pos.x)),
            //n.render ? Graphics.minimapMob(e.minimapSprite, n.pos.x, n.pos.y) : Graphics.minimapMob(e.minimapSprite, n.lowResPos.x, n.lowResPos.y),
            //e.visible)) {
                //e.position.x = n.pos.x,
                //e.position.y = n.pos.y,
                //e.sprite.position.set(n.pos.x, n.pos.y);
                //var r = Graphics.shadowCoords(n.pos);
                //e.spriteShadow.position.set(r.x, r.y),
                //e.momentum = Tools.clamp(e.momentum + (n.pos.x - e.diffX) * game.timeFactor, -40, 40);
                //var i = e.momentum > 0 ? .1 : -.1;
                //e.direction = Tools.clamp(e.direction - i * game.timeFactor, -.4, .4),
                //e.sprite.scale.x = e.direction,
                //e.spriteShadow.scale.x = 1.1 * e.direction;
                //var o = .04 * -(n.pos.x - e.diffX) * game.timeFactor;
                //e.sprite.rotation = o,
                //e.spriteShadow.rotation = o,
                //e.diffX = n.pos.x
            //}
        //} else {
            //var s = Graphics.inScreen(e.position, 128);
            //s != e.visible && (e.visible = s,
            //e.sprite.visible = s,
            //e.spriteShadow.visible = s)
        //}
    };
    Games.spectate = function(e) {
        null == game.spectatingID && 3 != game.gameType && UI.showMessage("alert", '<span class="info">SPECTATOR MODE</span>Click on Respawn to resume playing', 4e3),
        game.spectatingID = e;
        var t = Players.get(e)
          , n = '<div id="spectator-tag" class="spectating">Spectating ' + (null == t ? "" : UI.escapeHTML(t.name)) + '</div><div class="buttons"><div onclick="Network.spectateNext()" class="changeplayer left"><div class="arrow"></div></div><div onclick="Network.spectatePrev()" class="changeplayer right"><div class="arrow"></div></div></div>';
        UI.showSpectator(n)
    }
    ,
    Games.spectatorSwitch = function(e) {
        setTimeout(function() {
            e == game.spectatingID && Network.spectateNext()
        }, 2e3)
    }
    ,
    Games.playersAlive = function(e) {
        var t = "";
        e > 1 && (t = '<div class="playersalive">' + e + " players alive</div>"),
        $("#gamespecific").html(t)
    }
    ,
    Games.showBTRWin = function(e) {
		//original
        //if (!$("#custom-msg").length) {
            //var t = '<div id="custom-msg" class="btrwin"><div class="trophy"></div><div class="winner"><div class="player"><span class="flag big flag-' + e.f + '"></span>' + UI.escapeHTML(e.p) + '</div></div><div class="bounty"><span class="stat">' + e.k + " KILL" + (1 == e.k ? "" : "S") + "</span>+" + e.b + " BOUNTY</div></div>";
            //$("body").append(t),
            //UI.showPanel("#custom-msg"),
            //setTimeout(function() {
                //UI.hidePanel("#custom-msg", !1, !0)
            //}, 1e3 * e.t),
            //Sound.gameComplete()
        //}
    }
    ,
    Games.showCTFWin = function(e) {
		CTF_MatchEnded();
		setTimeout(function() {
			CTF_MatchStarted();
		}, 63000)
        
		//original
		//if (!$("#custom-msg").length) {
            //var t = '<div id="custom-msg" class="ctfwin"><div class="trophy"></div><div class="winner">' + (1 == e.w ? '<div class="player blue">BLUE TEAM</div>' : '<div class="player red">RED TEAM</div>') + '</div><div class="bounty">+' + e.b + " BOUNTY</div></div>";
            //$("body").append(t),
            //UI.showPanel("#custom-msg"),
            //setTimeout(function() {
                //UI.hidePanel("#custom-msg", !1, !0)
            //}, 1e3 * e.t),
            //Sound.gameComplete()
        //}
    }
    ,
    Games.showLevelUP = function(e) {
        //$("#custom-msg").length && $("#custom-msg").remove();
        //var t = ""
          //, n = " lvlsmaller";
        //null != _[e + ""] && (n = "",
        //t = '<div class="unlocked">FEATURE UNLOCKED<br><div class="unlockedtext">' + _[e + ""] + "</div></div>");
        //var r = '<div id="custom-msg" class="levelup' + n + '"><div class="leveltext">NEW LEVEL REACHED</div><div class="levelbadge"></div><div class="levelnum">' + e + "</div>" + t + "</div>";
        //$("body").append(r),
        //UI.showPanel("#custom-msg"),
        //Sound.levelUp(),
        //UI.showChatLevel(e)
    }
    ,
    Games.popFirewall = function(e, t) {
        t <= 0 && (t = 0),
        y || (y = !0,
        v = new PIXI.Graphics,
        game.graphics.gui.minimap.mask = v),
        v.clear(),
        v.beginFill(16777215),
        v.drawCircle(game.screenX - config.minimapPaddingX - config.minimapSize * (16384 - e.x) / 32768, game.screenY - config.minimapPaddingY - config.minimapSize / 2 * (8192 - e.y) / 16384, 2 * t / (256 / config.minimapSize * 256)),
        v.endFill();
        var n = Graphics.getCamera()
          , r = Math.ceil((game.halfScreenX + 64) / game.scale / 64)
          , i = Math.ceil((game.halfScreenY + 64) / game.scale / 64)
          , o = 0
          , s = 0
          , a = ""
          , l = {}
          , u = 0
          , c = 0
          , h = new Vector(n.x - game.halfScreenX / game.scale - 64,n.y - game.halfScreenY / game.scale - 64)
          , d = new Vector(n.x + game.halfScreenX / game.scale + 64,n.y - game.halfScreenY / game.scale - 64)
          , p = new Vector(n.x - game.halfScreenX / game.scale - 64,n.y + game.halfScreenY / game.scale + 64)
          , f = new Vector(n.x + game.halfScreenX / game.scale + 64,n.y + game.halfScreenY / game.scale + 64);
        if (Tools.distance(e.x, e.y, h.x, h.y) > t || Tools.distance(e.x, e.y, d.x, d.y) > t || Tools.distance(e.x, e.y, p.x, p.y) > t || Tools.distance(e.x, e.y, f.x, f.y) > t)
            for (var g = -r; g <= r; g++)
                for (var b = -i; b <= i; b++)
                    if (o = 64 * (Math.floor(n.x / 64) + .5) + 64 * g,
                    s = 64 * (Math.floor(n.y / 64) + .5) + 64 * b,
                    !((u = Tools.distance(o, s, e.x, e.y)) < t) && (a = o + "_" + s,
                    l[a] = !0,
                    null == m[a])) {
                        var _ = Textures.sprite("hotsmoke_" + Tools.randInt(1, 4));
                        _.scale.set(Tools.rand(1.5, 2.5)),
                        _.anchor.set(.5, .5),
                        _.position.set(o, s),
                        c = 1,
                        Tools.rand(0, 1) > .5 && (_.blendMode = PIXI.BLEND_MODES.ADD,
                        c = .5),
                        game.graphics.layers.powerups.addChild(_),
                        m[a] = {
                            sprite: _,
                            rotation: Tools.rand(0, 100),
                            rotationSpeed: Tools.rand(-.0025, .0025),
                            opacity: 0,
                            maxOpacity: c,
                            opacitySpeed: u - t >= 64 ? .02 : .0035,
                            color: Tools.rand(0, 1),
                            colorDir: Tools.rand(0, 1) < .5 ? -1 : 1
                        }
                    }
        for (var x in m)
            null != l[x] ? (m[x].rotation += m[x].rotationSpeed * game.timeFactor,
            m[x].opacity += m[x].opacitySpeed * game.timeFactor,
            m[x].opacity > m[x].maxOpacity && (m[x].opacity = m[x].maxOpacity),
            m[x].color += .005 * m[x].colorDir * game.timeFactor,
            m[x].color < 0 && (m[x].colorDir = 1),
            m[x].color > 1 && (m[x].colorDir = -1),
            m[x].sprite.rotation = m[x].rotation,
            m[x].sprite.alpha = m[x].opacity,
            m[x].sprite.tint = Tools.colorLerp(16427014, 16404230, m[x].color)) : (game.graphics.layers.powerups.removeChild(m[x].sprite),
            m[x].sprite.destroy(),
            delete m[x])
    }
    ;
    var L = function() {
        if (y) {
            for (var e in m)
                game.graphics.layers.powerups.removeChild(m[e].sprite),
                m[e].sprite.destroy();
            m = {},
            game.graphics.gui.minimap.mask = null,
            null != v && (v.destroy(),
            v = null),
            y = !1
        }
    };
    Games.handleFirewall = function(e) {
        0 == e.status ? L() : (b.radius = e.radius,
        b.pos.x = e.posX,
        b.pos.y = e.posY,
        b.speed = e.speed,
        Games.popFirewall(b.pos, b.radius))
    }
    ,
    Games.update = function(e) {
        2 == game.gameType && g.flagBlue && (k(g.flagBlue, e),
        k(g.flagRed, e)),
        3 == game.gameType && y && (b.radius += b.speed / 60 * game.timeFactor,
        Games.popFirewall(b.pos, b.radius))
    }
})();






var config = {
        storage: {},
        settings: {},
        ships: [{}, {
            name: "raptor",
            turnFactor: .065,
            accelFactor: .225,
            maxSpeed: 5.5,
            minSpeed: .001,
            brakeFactor: .025,
            energyLight: .6,
            collisions: [[0, 5, 23], [0, -15, 15], [0, -25, 12]]
        }, {
            name: "spirit",
            turnFactor: .04,
            accelFactor: .15,
            maxSpeed: 3.5,
            minSpeed: .001,
            brakeFactor: .015,
            energyLight: .9,
            collisions: [[0, 0, 35], [50, 14, 16], [74, 26, 14], [30, 8, 23], [63, 22, 15], [-50, 14, 16], [-74, 26, 14], [-30, 8, 23], [-63, 22, 15]]
        }, {
            name: "mohawk",
            turnFactor: .07,
            accelFactor: .275,
            maxSpeed: 6,
            minSpeed: .001,
            brakeFactor: .025,
            energyLight: .3,
            collisions: [[0, -12, 15], [0, 0, 17], [0, 13, 15], [0, 26, 15]]
        }, {
            name: "tornado",
            turnFactor: .055,
            accelFactor: .2,
            maxSpeed: 4.5,
            minSpeed: .001,
            brakeFactor: .025,
            energyLight: .5,
            collisions: [[0, 8, 18], [14, 12, 13], [-14, 12, 13], [0, -12, 16], [0, -26, 14], [0, -35, 12]]
        }, {
            name: "prowler",
            turnFactor: .055,
            accelFactor: .2,
            maxSpeed: 4.5,
            minSpeed: .001,
            brakeFactor: .025,
            energyLight: .75,
            collisions: [[0, 11, 25], [0, -8, 18], [19, 20, 10], [-19, 20, 10], [0, -20, 14]]
        }],
        mobs: [{}, {
            exhaust: 20,
            thruster: [.2, .4]
        }, {
            exhaust: 30,
            thruster: [.3, .6]
        }, {
            exhaust: 18,
            thruster: [.14, .3]
        }, {}, {
            exhaust: 20,
            thruster: [.2, .4]
        }, {
            exhaust: 20,
            thruster: [.2, .4]
        }, {
            exhaust: 20,
            thruster: [.2, .4]
        }],
        upgrades: {
            speed: {
                cost: [0, 1, 1, 1, 1, 1],
                factor: [1, 1.05, 1.1, 1.15, 1.2, 1.25]
            },
            defense: {
                cost: [0, 1, 1, 1, 1, 1],
                factor: [1, 1.05, 1.1, 1.15, 1.2, 1.25]
            },
            energy: {
                cost: [0, 1, 1, 1, 1, 1],
                factor: [1, 1.05, 1.1, 1.15, 1.2, 1.25]
            },
            missile: {
                cost: [0, 1, 1, 1, 1, 1],
                factor: [1, 1.05, 1.1, 1.15, 1.2, 1.25]
            }
        },
        doodads: [[1009, -2308, 1, .9, .2, null, null], [1241, -2490, 4, .5, -.2, null, null], 
			[1157, -2379, 2, .7, -.1, null, null], [622, -2126, 3, .4, null, null, null], 
			[669, -2187, 2, .6, null, null, null], [-392, -1669, 1, 1.1, .1, null, null], 
			[-273, -1746, 4, .5, -.1, null, null], [-252, -1504, 2, 1, null, null, null], 
			[1553, -2016, 2, .4, .2, null, null], [1637, -1972, 1, .5, .1, null, null], [1736, -1922, 2, .5, .7, null, null], 
			[2150, -2406, 2, .6, null, null, null], [2238, -2318, 3, .9, null, null, null], [2364, -2391, 4, .6, 0, null, null], 
			[2491, -2682, 1, .6, -.1, null, null], [2596, -2671, 2, .9, .2, null, null], [-150, -3147, 4, .4, -.4, null, null], 
			[-155, -3044, 2, .7, 0, null, null], [-427, -3600, 2, .4, null, null, null], [-259, -2982, 2, .5, null, null, null], 
			[-379, -3529, 1, .6, .1, 1, null], [-665, -3052, 2, .5, null, null, null], [20, -1816, 4, .5, .3, null, null], 
			[127, -1799, 1, .5, null, null, null], [263, -2572, 3, .4, .4, null, null], [405, -2570, 1, .9, -.2, null, null], 
			[851, -4183, 1, 1, null, null, null], [754, -3971, 2, .9, -.1, 1, null], [1757, -5065, 4, 1.1, null, null, null], 
			[1169, -4453, 3, .9, null, null, null], [2054, -5244, 3, .9, null, null, null], [1631, -4901, 1, .9, 0, null, null], 
			[2305, -5281, 2, .9, .2, 1, null], [1007, -4281, 1, .8, .1, null, null], [2766, -5202, 1, .8, .1, 1, null], 
			[2927, -5204, 2, .7, null, 1, null], [3206, -5218, 2, .3, .6, 1, null], [3099, -5193, 4, .6, .1, 1, null], 
			[1417, -4726, 2, 1, null, null, null], [2844, -1513, 4, .5, .1, null, null], [3206, -1464, 1, 1, .1, 1, null], 
			[2881, -1403, 2, .9, null, null, null], [3804, -2025, 1, .7, -.1, null, null], [4116, -1778, 2, .9, -.3, null, null], 
			[3715, -1508, 3, .6, .1, null, null], [4247, -1126, 1, .6, .1, 1, null], [3860, 268, 1, .5, .5, 1, null], 
			[4334, -1011, 2, 1.1, -.1, null, null], [3849, 349, 3, .6, null, null, null], [3956, 490, 4, .8, -.4, null, null], 
			[4073, 667, 2, .9, -.5, null, null], [3583, -864, 4, .8, .1, .8, 15723705], [4135, 836, 2, 1, -.2, null, null], 
			[4785, -743, 2, 1, .1, null, null], [4993, -839, 1, .9, .3, 1, null], [5224, -482, 3, .7, null, null, null], 
			[5235, -1238, 4, 1.1, null, 1, null], [5419, -1346, 2, .6, -.5, .8, null], [6075, -5099, 1, .8, null, null, null], 
			[5767, -4953, 2, .9, -.3, 1, null], [5896, -4967, 2, .9, .1, 1, null], [5384, -4642, 4, .9, null, null, null], 
			[5704, -4857, 4, .9, null, null, null], [5563, -4697, 2, .9, null, null, null], [5406, -4470, 1, 1.1, null, null, null], 
			[5352, -3964, 3, .9, null, null, null], [5309, -3665, 1, 1.1, null, null, null], [5247, -3464, 4, .9, -.5, null, null], 
			[5300, -3121, 1, .9, null, null, null], [3524, -3340, 1, 1.1, 0, null, null], [3661, -3589, 2, .9, -.7, null, null], 
			[7236, -1376, 2, .6, -.3, null, null], [7624, -1610, 2, .8, null, null, null], [7403, -1555, 2, .7, null, null, null], 
			[7514, -1568, 2, .9, 0, null, null], [3660, -2705, 1, .9, .2, null, null], [3374, -2813, 2, .8, null, null, null], 
			[7347, -1447, 1, .9, .1, null, null], [7236, -775, 4, .5, -.9, null, null], [7207, -631, 2, .9, 0, null, null], 
			[7303, -468, 1, .9, -.3, null, null], [7262, -1263, 4, .9, -.6, null, null], [7404, -350, 2, 1, .6, null, null], 
			[7589, -305, 3, .9, .6, null, null], [7741, -1589, 4, 1, .2, null, null], [7949, -1594, 1, 1, -.2, null, null], 
			[8152, -1599, 2, 1.1, .1, null, null], [8378, -1602, 4, 1.2, 0, null, null], [7873, -321, 2, .6, .3, null, null], 
			[8543, -1661, 1, .7, 0, null, null], [7790, -259, 1, 1, .1, null, null], [8675, -1573, 2, 1, .1, null, null], 
			[8163, -245, 2, .7, .3, null, null], [8329, -311, 2, .7, .5, null, null], [8275, -229, 1, 1, .1, null, null], 
			[8447, -277, 3, 1, 0, null, null], [8824, -1447, 1, .9, -.4, null, null], [7221, -1140, 1, .5, -.2, null, null], 
			[8924, -1273, 2, .9, -.5, null, null], [6844, -950, 3, 1, .1, null, null], [8949, -1060, 3, 1.1, -.3, null, null], 
			[8904, -920, 4, .8, -.7, null, null], [8582, -338, 2, .7, null, null, null], [8963, -803, 1, 1, -.4, null, null], 
			[8680, -322, 4, .9, 0, null, null], [8811, -449, 1, .9, -.3, null, null], [8910, -610, 2, .9, -.4, null, null], 
			[6855, 114, 1, .8, null, null, null], [6971, 241, 2, 1, -.1, null, null], [6852, 656, 2, .5, .3, null, null], 
			[6980, 706, 1, .9, -.4, null, null], [6946, 939, 4, 1, -.2, null, null], [6027, -560, 1, .6, 0, null, null], 
			[7521, 425, 2, .4, .1, null, null], [7599, 389, 1, .5, -.5, null, null], [5863, -431, 2, .9, .1, null, null], 
			[9392, 262, 2, .9, -.1, null, null], [7521, 512, 3, .6, null, null, null], [9807, 1027, 1, .5, -.1, null, null], 
			[9554, 237, 1, 1, -.2, 1, null], [9346, 392, 4, 1.2, -.3, null, null], [9789, 1142, 3, .7, null, null, null], 
			[9747, -532, 4, .8, .2, 1, null], [8591, 347, 4, .6, -.2, null, null], [9951, -509, 1, 1, null, null, null], 
			[9308, 2417, 1, .5, .1, null, null], [10185, -522, 2, .9, null, 1, null], [10330, 2147, 1, .6, 0, null, null], 
			[9350, 2480, 3, .7, null, null, null], [10503, 2124, 2, .9, null, null, null], [12500, 2628, 4, .5, .3, null, null], 
			[13188, 2864, 4, .5, -.1, null, null], [12637, 2659, 2, .7, .1, null, null], [13262, 2899, 1, .5, null, null, null], 
			[13777, 5168, 1, .5, -.3, null, null], [15709, 6399, 1, .4, null, null, null], [13539, 5664, 3, .5, null, 1, null], 
			[15660, 6474, 2, .4, -.3, null, null], [13743, 5248, 2, .7, -.1, null, null], [15482, 6600, 2, .4, -.1, null, null], 
			[15591, 6525, 4, .3, null, null, null], [13487, 5738, 4, .7, null, null, null], [15407, 6702, 1, .6, .1, null, null], 
			[8171, -2568, 2, .5, .1, null, null], [16001, 6015, 3, .6, null, null, null], [16017, 6110, 1, .4, null, 1, null], 
			[6496, -1491, 1, .5, .3, null, null], [6626, -1480, 2, .7, null, null, null], [6190, -1022, 4, .8, null, null, null], 
			[8325, -2615, 2, 1, -.3, null, null], [8222, -2412, 4, 1, null, null, null], [9204, -2288, 1, .9, -.1, null, null], 
			[9279, -2216, 2, 1, null, null, null], [10375, -1558, 2, .8, -.3, null, null], [10309, -1421, 1, .9, null, null, null], 
			[10247, -1216, 4, 1.2, -.5, null, null], [10079, -2310, 4, .9, .3, null, null], [10320, -2330, 3, 1, null, null, null], 
			[10942, -2963, 2, .9, -.3, null, null], [10807, -2778, 4, 1.1, -.5, null, null], [12989, -1929, 3, .6, null, null, null], 
			[12613, -1181, 1, .4, 0, 1, null], [12559, -1120, 2, .5, null, null, null], [11642, -1900, 4, .7, -.5, null, null], 
			[11558, -1692, 1, .9, -.2, null, null], [11509, -1479, 2, .5, null, null, null], [12559, -2673, 1, .8, null, null, null], 
			[12446, -2487, 4, 1, -.5, null, null], [12375, -2303, 3, .9, -.2, null, null], [10363, -3514, 4, .7, -.4, null, null], 
			[10290, -3340, 1, .9, -.2, null, null], [10162, -3207, 2, .7, null, null, null], [9003, -3048, 4, .9, -.1, null, null], 
			[9161, -3119, 1, .6, null, null, null], [14550, -3462, 2, .9, -.2, null, null], [14407, -3335, 4, .9, -.2, null, null], 
			[14366, -4493, 2, .9, .5, null, null], [14477, -4437, 3, 1, null, null, null], [15305, -4230, 4, .9, .1, null, null], 
			[15481, -4283, 2, .9, null, null, null], [15349, -5009, 4, .4, .3, null, null], [11874, -4879, 2, .6, null, null, null], 
			[15453, -4984, 1, .7, null, null, null], [11907, -4742, 4, .8, -.6, null, null], [12440, -4278, 4, .5, .3, null, null], 
			[11980, -4582, 2, .9, null, null, null], [12131, -4387, 1, 1.1, null, null, null], [15681, -4973, 4, 1, null, null, null], 
			[12591, -4252, 1, .8, null, null, null], [12777, -4244, 2, .9, .2, null, null], [12969, -4227, 3, .9, null, null, null], 
			[15897, -5071, 2, .9, -.2, null, null], [13204, -4228, 4, 1, null, null, null], [11592, -5261, 1, .7, .2, null, null], 
			[12743, -4826, 1, .4, .3, null, null], [10102, -5078, 2, .7, .4, null, null], [12854, -4782, 3, .9, .1, null, null], 
			[10191, -5033, 1, .7, null, null, null], [10523, -5133, 2, 1, null, null, null], [10336, -4977, 4, 1.1, -.3, null, null], 
			[10667, -5250, 2, .8, -.1, null, null], [9665, -6403, 4, .7, .3, null, null], [10798, -5379, 1, .5, null, null, null], 
			[9670, -5547, 1, .9, -.1, null, null], [9834, -6369, 3, 1, null, null, null], [9864, -5572, 2, 1.1, -.1, null, null], 
			[11362, -3957, 2, .9, null, 1, null], [11162, -3830, 4, 1, -.1, null, null], [8922, -6173, 4, 1, null, null, null], 
			[9003, -5368, 1, .5, null, null, null], [8453, -6153, 1, .6, .2, null, null], [8954, -5229, 3, .9, -.2, null, null], 
			[8905, -5072, 1, .8, -.3, null, null], [8704, -3873, 3, .9, null, null, null], [8578, -6105, 2, .8, .4, null, null], 
			[8508, -3710, 1, .7, 0, null, null], [8614, -5400, 4, .5, null, null, null], [8788, -4922, 4, 1.1, null, null, null], 
			[8936, -3905, 4, .6, .3, null, null], [9701, -4613, 4, .9, -.1, null, null], [6973, -4776, 2, .6, null, null, null], 
			[7016, -4674, 1, .9, null, null, null], [9124, -3853, 1, .9, .2, null, null], [7253, -4648, 4, .8, .2, null, null], 
			[6602, -4591, 1, .6, .2, null, null], [8510, -5322, 2, .9, null, null, null], [6687, -3810, 4, .7, .3, null, null], 
			[9525, -4492, 3, 1.1, null, null, null], [7461, -4705, 2, .9, null, null, null], [9280, -3812, 2, .8, -.3, null, null], 
			[6467, -2811, 1, .3, null, null, null], [6842, -3820, 1, .8, .3, null, null], [6483, -2725, 4, .6, .3, null, null], 
			[7675, -4864, 1, 1.1, null, null, null], [6991, -2885, 4, .9, .2, null, null], [6610, -2664, 4, .9, null, null, null], 
			[6822, -2736, 2, .9, null, null, null], [6763, -4582, 3, .9, null, null, null], [6509, -2490, 2, .9, -.3, null, null], 
			[7216, -3865, 4, 1.1, .2, 1, null], [7018, -3708, 2, 1, .2, null, null], [2254, -3301, 1, .8, .5, null, null], 
			[6378, -2310, 1, .8, .2, null, null], [7197, -2857, 2, .9, null, null, null], [2609, -3483, 4, .5, null, null, null], 
			[2449, -3385, 2, .9, .3, 1, null], [4585, -2889, 4, .7, -.2, null, null], [4470, -2768, 3, .8, .2, null, null], 
			[4083, -4033, 1, .9, .5, 1, null], [1568, -2869, 1, .4, null, null, null], [4336, -4105, 2, 1.2, null, null, null], 
			[1977, -1678, 2, .5, null, null, null], [1412, -3642, 1, .5, 0, 1, null], [1570, -2792, 4, .6, null, null, null], 
			[1932, -1586, 1, .6, null, null, null], [1310, -3547, 2, .6, 0, null, null], [3611, 1391, 2, 1, null, null, null], 
			[3558, 2174, 2, .9, null, null, null], [3431, 1563, 1, .9, .3, null, null], [3142, 2813, 2, .7, null, null, null], 
			[3330, 2296, 4, 1.1, null, null, null], [3001, 2818, 1, .6, .3, null, null], [3703, 2044, 1, .4, null, null, null], 
			[2872, 3863, 1, .9, -.2, null, null], [3125, 2942, 3, 1.1, null, null, null], [2841, 4018, 4, 1.1, .1, null, null], 
			[2402, 5140, 4, .6, .3, null, null], [2511, 5167, 3, .8, null, null, null], [-14607, -5112, 4, .9, .1, null, null], 
			[-14430, -5180, 1, .9, 0, null, null], [-14197, -5222, 2, 1.2, -.1, null, null], [-14895, -4703, 4, .5, .2, null, null], 
			[-14797, -4728, 2, .4, null, null, null], [-14697, -4739, 1, .4, null, null, null], [-13919, -5281, 1, 1.1, 0, null, null], 
			[-13646, -5170, 3, .7, null, null, null], [-13400, -5068, 2, 1.2, .2, null, null], [-13099, -5108, 4, 1.1, .2, null, null], 
			[-12824, -5092, 1, .9, null, null, null], [-12631, -5044, 2, .9, -.2, null, null], [-12427, -4914, 1, .9, null, null, null], 
			[-12270, -4816, 2, .7, -.3, null, null], [-11772, -4983, 2, .7, 0, null, null], [-11940, -4867, 1, .9, null, null, null], 
			[-12091, -4699, 3, .9, null, null, null], [-12270, -4529, 4, .7, null, null, null], [-12460, -4396, 1, .9, .4, null, null], 
			[-13058, -4252, 1, .9, null, null, null], [-12894, -4096, 4, .7, .2, null, null], [-12738, -4077, 2, .7, null, null, null], 
			[-13546, -4341, 1, .4, null, null, null], [-13428, -4299, 3, .9, null, null, null], [-14679, -4192, 1, .7, -.1, null, null], 
			[-14368, -4308, 4, .7, -.2, null, null], [-14495, -4133, 2, 1.1, -.1, null, null], [-12072, -3824, 2, .8, -.1, null, null], 
			[-11904, -3648, 1, 1, 0, null, null], [-11654, -3569, 3, .7, null, null, null], [-11648, -3357, 4, .9, 0, null, null], 
			[-11420, -3359, 1, .9, null, null, null], [-11296, -3135, 2, .7, null, null, null], [-10782, -2838, 1, .8, -.1, null, null], 
			[-11410, -3039, 1, .3, .6, null, null], [-10581, -2773, 2, 1.1, .1, null, null], [-11118, -5114, 4, .8, .2, null, null], 
			[-10675, -5079, 1, .9, null, null, null], [-10205, -4890, 1, .8, .1, null, null], [-11543, -4164, 4, .8, .3, null, null], 
			[-11287, -4244, 2, .5, null, null, null], [-10018, -4747, 2, 1, -.2, null, null], [-9278, 419, 3, .5, null, null, null], 
			[-9341, 470, 4, .5, .3, null, null], [-9180, 496, 1, .8, .6, null, null], [-11365, -4131, 3, 1, null, null, null], 
			[-9353, 0, 3, .6, .3, null, null], [-8975, 528, 2, 1, .1, null, null], [-9413, 89, 4, .9, null, null, null], 
			[-8230, 770, 1, .4, null, null, null], [-9231, 17, 1, .7, 0, null, null], [-6808, 1667, 3, .5, -.2, null, null], 
			[-6694, 1622, 2, .8, -.4, null, null], [-8285, 855, 3, .6, null, null, null], [-6793, 1796, 2, .8, .4, null, null], 
			[-6865, 1935, 1, .5, -.1, null, null], [-7043, 2222, 3, .6, -.2, null, null], [-7083, 2368, 1, .6, -.2, null, null], 
			[-7103, 2533, 4, .7, -.4, null, null], [-7099, 2721, 2, .8, -.3, null, null], [-7178, 2874, 1, .4, null, null, null], 
			[-6964, 3110, 4, .7, .2, null, null], [-6246, 4191, 1, .6, -.1, null, null], [-6735, 3446, 1, .4, .1, null, null], 
			[-6722, 3537, 4, .7, .4, null, null], [-6396, 3388, 4, .9, null, null, null], [-6787, 3140, 2, .9, null, null, null], 
			[-6227, 4488, 2, .7, -.5, null, null], [-6281, 3953, 1, .6, .2, null, null], [-6530, 3576, 1, 1.1, null, null, null], 
			[-6147, 3994, 3, 1.1, null, null, null], [-6141, 4292, 2, 1.2, -.3, null, null], [-6377, 5578, 2, .7, -.5, null, null], 
			[-6152, 4569, 1, .9, -.2, null, null], [-6222, 4769, 4, .7, -.5, null, null], [-6266, 4956, 1, .6, -.2, null, null], 
			[-6233, 5414, 1, .9, -.4, null, null], [-6347, 5646, 3, .7, -.1, 1, null], [-6400, 6066, 2, .7, -.2, null, null], 
			[-6411, 6261, 1, .8, null, null, null], [-6565, 7043, 1, .6, -.3, null, null], [-6377, 6415, 4, .9, -.3, null, null], 
			[-6440, 6614, 1, .7, -.2, null, null], [-5944, 1954, 3, .5, -.4, null, null], [-6001, 2039, 1, .8, .2, null, null], 
			[-6467, 7070, 3, .9, null, null, null], [-4963, 3608, 1, .6, -.3, 1, null], [-4776, 3510, 2, .4, -.1, 1, null], 
			[-5785, 1998, 2, 1.1, -.2, null, null], [-3708, 3449, 1, .6, -.3, null, null], [-3790, 3582, 1, .9, null, null, null], 
			[-4031, 3697, 4, .7, -.1, null, null], [-4859, 3634, 3, 1, null, null, null], [-3850, 3730, 2, 1, .2, null, null], 
			[-4689, 4605, 4, .9, -.2, null, null], [-3492, 2892, 1, .6, -.2, null, null], [-4507, 4483, 1, .6, null, null, null], 
			[-4829, 2745, 1, .9, -.2, null, null], [-4435, 4273, 2, .9, -.6, null, null], [-3383, 2930, 2, .9, null, null, null], 
			[-4888, 2821, 2, .9, .1, null, null], [-5372, 5172, 1, .5, null, null, null], [-5036, 2981, 4, .9, .3, null, null], 
			[-9895, -1942, 1, 1, .1, null, null], [-9371, -2159, 4, .6, null, null, null], [-9995, -1773, 4, .9, -.5, null, null], 
			[-5280, 5218, 4, .9, 0, null, null], [-5079, 5183, 1, .9, -.3, null, null], [-5149, 3079, 1, .6, .2, null, null], 
			[-9695, -2048, 2, 1, -.1, null, null], [-5063, 5374, 2, .9, -.2, null, null], [-9504, -2059, 1, 1, .2, null, null], 
			[-8948, -2140, 4, .7, .3, null, null], [-9262, -2081, 2, 1.1, .4, null, null], [-9068, -2071, 4, 1, .2, null, null], 
			[-8861, -2045, 2, 1.1, 0, null, null], [-8654, -2083, 1, 1, .3, null, null], [-8473, -2048, 3, 1, 0, null, null], 
			[-8283, -1965, 1, 1, .5, null, null], [-8182, -1863, 2, .9, -.2, null, null], [-10037, -1579, 1, .9, -.4, null, null], 
			[-10063, -1365, 2, .9, -.1, null, null], [-10074, -1190, 1, .9, -.4, null, null], [-8167, -1225, 1, .5, -.7, null, null], 
			[-8188, -1087, 4, .8, -.5, null, null], [-9975, -1022, 1, .9, .3, null, null], [-9835, -910, 2, 1, .1, null, null], 
			[-9709, -848, 4, 1, .3, null, null], [-9532, -792, 2, 1, .1, null, null], [-9348, -779, 1, 1, 0, null, null], 
			[-9131, -784, 2, 1.1, .1, null, null], [-8754, -795, 3, .7, null, null, null], [-8587, -797, 4, 1, 0, null, null], 
			[-8424, -856, 1, .9, null, null, null], [-8246, -921, 2, .9, -.4, null, null], [-8153, -1701, 4, .7, -.7, null, null], 
			[-6447, -2137, 1, .6, -.2, null, null], [-8153, -1591, 1, .5, -.6, null, null], [-7694, -1393, 4, 1, -.1, null, null], 
			[-6541, -2030, 2, .7, null, null, null], [-7135, -1547, 2, .7, .1, null, null], [-5885, -2958, 1, .6, .3, null, null], 
			[-7171, -1440, 1, .8, -.2, null, null], [-5620, -3123, 2, .6, -.4, null, null], [-6631, -1866, 4, .8, null, null, null], 
			[-5882, -3696, 2, .8, -.4, null, null], [-5716, -2944, 3, .9, null, null, null], [-5949, -3528, 1, .5, -.1, null, null], 
			[-6869, -4052, 4, .8, null, null, null], [-7081, -2673, 3, .5, null, null, null], [-6725, -4069, 1, .6, -.2, null, null], 
			[-10487, -2295, 2, .5, .1, 1, null], [-7032, -2749, 2, .6, -.4, null, null], [-10769, -3817, 3, .6, -.2, null, null], 
			[-6607, -4081, 2, .5, null, null, null], [-10849, -1824, 1, .7, .1, null, null], [-10479, -2146, 4, .9, -.1, null, null], 
			[-7003, -2611, 4, .9, -.2, null, null], [-10749, -1511, 2, .6, -.4, null, null], [-10697, -1953, 2, 1, .1, null, null], 
			[-10848, -1330, 3, .9, null, null, null], [-10912, -1220, 4, .5, 0, null, null], [-9843, -2685, 4, .7, null, null, null], 
			[-10823, -3717, 2, .7, null, null, null], [-9697, -2713, 1, .6, .3, null, null], [-10080, -3431, 2, .4, null, null, null], 
			[-10648, -3844, 1, .9, null, null, null], [-9530, -2695, 2, 1, null, null, null], [-2387, -6791, 1, .9, null, null, null], 
			[-8465, -5037, 2, .7, null, null, null], [-2550, -6627, 2, .9, -.1, null, null], [-9325, -2822, 1, .7, -.1, null, null], 
			[-10140, -3346, 1, .8, null, null, null], [-8461, -4908, 4, .9, null, null, null], [8116, -1076, 2, .8, -.3, null, null], 
			[8115, -940, 4, .8, -.3, null, null], [-2503, -6359, 4, 1.4, -.6, null, null], [-9062, -1580, 2, .8, -.5, null, null], 
			[8120, -790, 1, .8, null, null, null], [-9065, -1444, 4, .8, -.3, null, null], [-2615, -6159, 1, 1, null, null, null], 
			[-2744, -5943, 2, 1.1, null, null, null], [-3713, -4955, 3, .9, null, null, null], [-9061, -1292, 1, .8, 0, null, null], 
			[-1551, -4718, 4, .5, null, null, null], [5251, -6249, 1, .5, null, 1, null], [5192, -6181, 2, .4, -.1, null, null], 
			[-2898, -5732, 3, .9, null, null, null], [-1705, -4629, 3, .8, null, null, null], [1618, -7035, 1, .5, null, null, null], 
			[-3829, -4776, 4, .9, null, null, null], [-2851, -5589, 4, 1.1, -.2, null, null], [-2974, -5399, 2, 1.1, null, null, null], 
			[-3952, -4568, 1, .9, null, null, null], [-4135, -4368, 2, 1.1, .1, 1, null], [-3428, -5104, 1, 1.1, null, null, null], 
			[-3167, -5254, 4, .9, .1, null, null], [-3049, -6916, 2, 1, null, null, null], [-3097, -6722, 1, .9, -.3, null, null], 
			[-3190, -6493, 3, 1, null, null, null], [-3318, -6284, 4, 1.1, null, null, null], [-4672, -5861, 1, 1.1, 1, null, null], 
			[-4480, -5668, 1, 1, null, null, null], [-4294, -5548, 2, .9, 1.1, null, null], [-3433, -6072, 1, 1, -.2, null, null], 
			[-3568, -5881, 3, 1, null, null, null], [-3736, -5698, 2, 1.2, null, null, null], [-3978, -7517, 3, .9, .1, null, null], 
			[-3956, -5572, 4, 1, null, null, null], [-4103, -5400, 1, 1, null, null, null], [-4281, -5240, 2, 1, null, null, null], 
			[-4409, -5034, 3, 1, null, null, null], [-4475, -4808, 4, .9, null, null, null], [-2777, -7546, 3, 1, .8, null, null], 
			[-2542, -7502, 2, .9, .4, null, null], [-2398, -7364, 1, .9, -.7, null, null], [-2350, -7151, 2, .9, -.4, null, null], 
			[-2315, -6976, 4, .8, -.8, null, null], [-3749, -7488, 4, 1, null, null, null], [-2995, -7596, 2, 1.2, .5, null, null], 
			[-3253, -7558, 3, 1.1, .3, null, null], [-3468, -7472, 4, 1, null, null, null], [-5028, -6473, 2, 1, .4, null, null], 
			[-3604, -7301, 1, 1.1, null, null, null], [-3678, -7078, 2, 1.1, null, null, null], [-3835, -6826, 3, 1.1, null, null, null], 
			[-3935, -6595, 2, 1, null, null, null], [-5214, -7381, 3, 1, null, null, null], [-4065, -6416, 3, 1.1, null, null, null], 
			[-4174, -6231, 4, .7, null, null, null], [-4556, -6940, 3, 1, null, null, null], [-4663, -6781, 4, 1, null, null, null], 
			[-4748, -6548, 2, 1.3, null, null, null], [-4847, -6257, 2, 1.1, -.4, null, null], [-4806, -6016, 4, .9, 1.2, null, null], 
			[-4950, -7410, 1, 1.4, .2, null, null], [-5470, -7251, 4, 1.3, -.2, null, null], [-5637, -7038, 2, 1, -.3, null, null], 
			[-5593, -6819, 4, 1, null, null, null], [-5406, -6727, 3, 1, .6, null, null], [-5263, -6580, 1, 1, .4, null, null], 
			[-4636, -7476, 2, 1, .2, null, null], [-4399, -7496, 2, .9, -.2, null, null], [-6769, -7571, 2, .9, -.4, null, null], 
			[-6853, -7377, 1, .9, null, null, null], [-8273, -7231, 4, .5, .4, null, null], [-4182, -7512, 4, .9, .1, null, null], 
			[-7525, -5855, 2, .9, null, null, null], [-7495, -6329, 3, .5, null, null, null], [-7297, -6946, 2, .9, null, null, null], 
			[-8148, -7137, 1, .7, null, null, null], [-7030, -7301, 4, .7, null, null, null]],
        walls: [[1009, -2308, 108], 
			[1241, -2490, 60], [1157, -2379, 84], [622, -2126, 48], [669, -2187, 72], [-392, -1669, 132], [-273, -1746, 60], [-252, -1504, 120], 
			[1553, -2016, 48], [1637, -1972, 60], [1736, -1922, 60], [2150, -2406, 72], [2238, -2318, 108], [2364, -2391, 72], 
			[2491, -2682, 72], [2596, -2671, 108], [-150, -3147, 48], [-155, -3044, 84], 
			[-427, -3600, 48], [-259, -2982, 60], [-379, -3529, 72], [-665, -3052, 60], 
			[20, -1816, 60], [127, -1799, 60], [263, -2572, 48], [405, -2570, 108], [851, -4183, 120], 
			[754, -3971, 108], [1757, -5065, 132], [1169, -4453, 108], [2054, -5244, 108], [1631, -4901, 108], 
			[2305, -5281, 108], [1007, -4281, 96], [2766, -5202, 96], [2927, -5204, 84], [3206, -5218, 36], [3099, -5193, 72], 
			[1417, -4726, 120], [2844, -1513, 60], [3206, -1464, 120], [2881, -1403, 108], [3804, -2025, 84], [4116, -1778, 108], 
			[3715, -1508, 72], [4247, -1126, 72], [3860, 268, 60], [4334, -1011, 132], [3849, 349, 72], [3956, 490, 96], [4073, 667, 108], 
			[3583, -864, 96], [4135, 836, 120], [4785, -743, 120], [4993, -839, 108], [5224, -482, 84], [5235, -1238, 132], [5419, -1346, 72], 
			[6075, -5099, 96], [5767, -4953, 108], [5896, -4967, 108], [5384, -4642, 108], [5704, -4857, 108], [5563, -4697, 108], 
			[5406, -4470, 132], [5352, -3964, 108], [5309, -3665, 132], 
			[5247, -3464, 108], [5300, -3121, 108], [3524, -3340, 132], 
			[3661, -3589, 108], [7236, -1376, 72], [7624, -1610, 96], [7403, -1555, 84], 
			[7514, -1568, 108], [3660, -2705, 108], [3374, -2813, 96], [7347, -1447, 108], 
			[7236, -775, 60], [7207, -631, 108], [7303, -468, 108], [7262, -1263, 108], 
			[7404, -350, 120], [7589, -305, 108], [7741, -1589, 120], [7949, -1594, 120], 
			[8152, -1599, 132], [8378, -1602, 144], [7873, -321, 72], [8543, -1661, 84], 
			[7790, -259, 120], [8675, -1573, 120], [8163, -245, 84], [8329, -311, 84], 
			[8275, -229, 120], [8447, -277, 120], [8824, -1447, 108], [7221, -1140, 60], 
			[8924, -1273, 108], [6844, -950, 120], [8949, -1060, 132], [8904, -920, 96], 
			[8582, -338, 84], [8963, -803, 120], [8680, -322, 108], [8811, -449, 108], 
			[8910, -610, 108], [6855, 114, 96], [6971, 241, 120], [6852, 656, 60], [6980, 706, 108], 
			[6946, 939, 120], [6027, -560, 72], [7521, 425, 48], [7599, 389, 60], [5863, -431, 108], 
			[9392, 262, 108], [7521, 512, 72], [9807, 1027, 60], [9554, 237, 120], [9346, 392, 144], 
			[9789, 1142, 84], [9747, -532, 96], [8591, 347, 72], [9951, -509, 120], [9308, 2417, 60], 
			[10185, -522, 108], [10330, 2147, 72], [9350, 2480, 84], [10503, 2124, 108], [12500, 2628, 60], 
			[13188, 2864, 60], [12637, 2659, 84], [13262, 2899, 60], [13777, 5168, 60], [15709, 6399, 48], 
			[13539, 5664, 60], [15660, 6474, 48], [13743, 5248, 84], [15482, 6600, 48], [15591, 6525, 36], 
			[13487, 5738, 84], [15407, 6702, 72], [8171, -2568, 60], [16001, 6015, 72], [16017, 6110, 48], 
			[6496, -1491, 60], [6626, -1480, 84], [6190, -1022, 96], [8325, -2615, 120], [8222, -2412, 120], 
			[9204, -2288, 108], [9279, -2216, 120], [10375, -1558, 96], [10309, -1421, 108], [10247, -1216, 144], 
			[10079, -2310, 108], [10320, -2330, 120], [10942, -2963, 108], [10807, -2778, 132], [12989, -1929, 72], 
			[12613, -1181, 48], [12559, -1120, 60], [11642, -1900, 84], [11558, -1692, 108], [11509, -1479, 60], 
			[12559, -2673, 96], [12446, -2487, 120], [12375, -2303, 108], [10363, -3514, 84], [10290, -3340, 108], 
			[10162, -3207, 84], [9003, -3048, 108], [9161, -3119, 72], [14550, -3462, 108], [14407, -3335, 108], 
			[14366, -4493, 108], [14477, -4437, 120], [15305, -4230, 108], [15481, -4283, 108], [15349, -5009, 48], 
			[11874, -4879, 72], [15453, -4984, 84], [11907, -4742, 96], [12440, -4278, 60], [11980, -4582, 108], 
			[12131, -4387, 132], [15681, -4973, 120], [12591, -4252, 96], [12777, -4244, 108], [12969, -4227, 108], 
			[15897, -5071, 108], [13204, -4228, 120], [11592, -5261, 84], [12743, -4826, 48], [10102, -5078, 84], 
			[12854, -4782, 108], [10191, -5033, 84], [10523, -5133, 120], [10336, -4977, 132], [10667, -5250, 96], 
			[9665, -6403, 84], [10798, -5379, 60], [9670, -5547, 108], [9834, -6369, 120], [9864, -5572, 132], 
			[11362, -3957, 108], [11162, -3830, 120], [8922, -6173, 120], [9003, -5368, 60], [8453, -6153, 72], 
			[8954, -5229, 108], [8905, -5072, 96], [8704, -3873, 108], [8578, -6105, 96], [8508, -3710, 84], 
			[8614, -5400, 60], [8788, -4922, 132], [8936, -3905, 72], [9701, -4613, 108], [6973, -4776, 72], 
			[7016, -4674, 108], [9124, -3853, 108], [7253, -4648, 96], [6602, -4591, 72], [8510, -5322, 108], 
			[6687, -3810, 84], [9525, -4492, 132], [7461, -4705, 108], [9280, -3812, 96], [6467, -2811, 36], 
			[6842, -3820, 96], [6483, -2725, 72], [7675, -4864, 132], [6991, -2885, 108], [6610, -2664, 108], 
			[6822, -2736, 108], [6763, -4582, 108], [6509, -2490, 108], [7216, -3865, 132], [7018, -3708, 120], 
			[2254, -3301, 96], [6378, -2310, 96], [7197, -2857, 108], [2609, -3483, 60], [2449, -3385, 108], 
			[4585, -2889, 84], [4470, -2768, 96], [4083, -4033, 108], [1568, -2869, 48], [4336, -4105, 144], 
			[1977, -1678, 60], [1412, -3642, 60], [1570, -2792, 72], [1932, -1586, 72], [1310, -3547, 72], 
			[3611, 1391, 120], [3558, 2174, 108], [3431, 1563, 108], [3142, 2813, 84], [3330, 2296, 132], 
			[3001, 2818, 72], [3703, 2044, 48], [2872, 3863, 108], [3125, 2942, 132], [2841, 4018, 132], 
			[2402, 5140, 72], [2511, 5167, 96], [-14607, -5112, 108], [-14430, -5180, 108], [-14197, -5222, 144], 
			[-14895, -4703, 60], [-14797, -4728, 48], [-14697, -4739, 48], [-13919, -5281, 132], [-13646, -5170, 84], 
			[-13400, -5068, 144], [-13099, -5108, 132], [-12824, -5092, 108], [-12631, -5044, 108], [-12427, -4914, 108], 
			[-12270, -4816, 84], [-11772, -4983, 84], [-11940, -4867, 108], [-12091, -4699, 108], [-12270, -4529, 84], 
			[-12460, -4396, 108], [-13058, -4252, 108], [-12894, -4096, 84], [-12738, -4077, 84], [-13546, -4341, 48], 
			[-13428, -4299, 108], [-14679, -4192, 84], [-14368, -4308, 84], [-14495, -4133, 132], [-12072, -3824, 96], 
			[-11904, -3648, 120], [-11654, -3569, 84], [-11648, -3357, 108], [-11420, -3359, 108], [-11296, -3135, 84], 
			[-10782, -2838, 96], [-11410, -3039, 36], [-10581, -2773, 132], [-11118, -5114, 96], [-10675, -5079, 108], 
			[-10205, -4890, 96], [-11543, -4164, 96], [-11287, -4244, 60], [-10018, -4747, 120], [-9278, 419, 60], 
			[-9341, 470, 60], [-9180, 496, 96], [-11365, -4131, 120], [-9353, 0, 72], [-8975, 528, 120], [-9413, 89, 108], 
			[-8230, 770, 48], [-9231, 17, 84], [-6808, 1667, 60], [-6694, 1622, 96], [-8285, 855, 72], [-6793, 1796, 96], 
			[-6865, 1935, 60], [-7043, 2222, 72], [-7083, 2368, 72], [-7103, 2533, 84], [-7099, 2721, 96], [-7178, 2874, 48], 
			[-6964, 3110, 84], [-6246, 4191, 72], [-6735, 3446, 48], [-6722, 3537, 84], [-6396, 3388, 108], [-6787, 3140, 108], 
			[-6227, 4488, 84], [-6281, 3953, 72], [-6530, 3576, 132], [-6147, 3994, 132], [-6141, 4292, 144], [-6377, 5578, 84], 
			[-6152, 4569, 108], [-6222, 4769, 84], [-6266, 4956, 72], [-6233, 5414, 108], [-6347, 5646, 84], [-6400, 6066, 84], 
			[-6411, 6261, 96], [-6565, 7043, 72], [-6377, 6415, 108], [-6440, 6614, 84], [-5944, 1954, 60], [-6001, 2039, 96], 
			[-6467, 7070, 108], [-4963, 3608, 72], [-4776, 3510, 48], [-5785, 1998, 132], [-3708, 3449, 72], [-3790, 3582, 108], 
			[-4031, 3697, 84], [-4859, 3634, 120], [-3850, 3730, 120], [-4689, 4605, 108], [-3492, 2892, 72], [-4507, 4483, 72], 
			[-4829, 2745, 108], [-4435, 4273, 108], [-3383, 2930, 108], [-4888, 2821, 108], [-5372, 5172, 60], [-5036, 2981, 108], 
			[-9895, -1942, 120], [-9371, -2159, 72], [-9995, -1773, 108], [-5280, 5218, 108], [-5079, 5183, 108], [-5149, 3079, 72], 
			[-9695, -2048, 120], [-5063, 5374, 108], [-9504, -2059, 120], [-8948, -2140, 84], [-9262, -2081, 132], [-9068, -2071, 120], 
			[-8861, -2045, 132], [-8654, -2083, 120], [-8473, -2048, 120], [-8283, -1965, 120], [-8182, -1863, 108], [-10037, -1579, 108], 
			[-10063, -1365, 108], [-10074, -1190, 108], [-8167, -1225, 60], [-8188, -1087, 96], [-9975, -1022, 108], [-9835, -910, 120], 
			[-9709, -848, 120], [-9532, -792, 120], [-9348, -779, 120], [-9131, -784, 132], [-8754, -795, 84], [-8587, -797, 120], 
			[-8424, -856, 108], [-8246, -921, 108], [-8153, -1701, 84], [-6447, -2137, 72], [-8153, -1591, 60], [-7694, -1393, 120], 
			[-6541, -2030, 84], [-7135, -1547, 84], [-5885, -2958, 72], [-7171, -1440, 96], [-5620, -3123, 72], [-6631, -1866, 96], 
			[-5882, -3696, 96], [-5716, -2944, 108], [-5949, -3528, 60], [-6869, -4052, 96], [-7081, -2673, 60], [-6725, -4069, 72], 
			[-10487, -2295, 60], [-7032, -2749, 72], [-10769, -3817, 72], [-6607, -4081, 60], [-10849, -1824, 84], [-10479, -2146, 108], 
			[-7003, -2611, 108], [-10749, -1511, 72], [-10697, -1953, 120], [-10848, -1330, 108], [-10912, -1220, 60], [-9843, -2685, 84], 
			[-10823, -3717, 84], [-9697, -2713, 72], [-10080, -3431, 48], [-10648, -3844, 108], [-9530, -2695, 120], [-2387, -6791, 108], 
			[-8465, -5037, 84], [-2550, -6627, 108], [-9325, -2822, 84], [-10140, -3346, 96], [-8461, -4908, 108], [8116, -1076, 96], 
			[8115, -940, 96], [-2503, -6359, 168], [-9062, -1580, 96], [8120, -790, 96], [-9065, -1444, 96], [-2615, -6159, 120], 
			[-2744, -5943, 132], [-3713, -4955, 108], [-9061, -1292, 96], [-1551, -4718, 60], [5251, -6249, 60], [5192, -6181, 48], 
			[-2898, -5732, 108], [-1705, -4629, 96], [1618, -7035, 60], [-3829, -4776, 108], [-2851, -5589, 132], [-2974, -5399, 132], 
			[-3952, -4568, 108], [-4135, -4368, 132], [-3428, -5104, 132], [-3167, -5254, 108], [-3049, -6916, 120], [-3097, -6722, 108], 
			[-3190, -6493, 120], [-3318, -6284, 132], [-4672, -5861, 132], [-4480, -5668, 120], [-4294, -5548, 108], [-3433, -6072, 120], 
			[-3568, -5881, 120], [-3736, -5698, 144], [-3978, -7517, 108], [-3956, -5572, 120], [-4103, -5400, 120], [-4281, -5240, 120], 
			[-4409, -5034, 120], [-4475, -4808, 108], [-2777, -7546, 120], [-2542, -7502, 108], [-2398, -7364, 108], [-2350, -7151, 108], 
			[-2315, -6976, 96], [-3749, -7488, 120], [-2995, -7596, 144], [-3253, -7558, 132], [-3468, -7472, 120], [-5028, -6473, 120], 
			[-3604, -7301, 132], [-3678, -7078, 132], [-3835, -6826, 132], [-3935, -6595, 120], [-5214, -7381, 120], [-4065, -6416, 132], 
			[-4174, -6231, 84], [-4556, -6940, 120], [-4663, -6781, 120], [-4748, -6548, 156], [-4847, -6257, 132], [-4806, -6016, 108], 
			[-4950, -7410, 168], [-5470, -7251, 156], [-5637, -7038, 120], [-5593, -6819, 120], [-5406, -6727, 120], [-5263, -6580, 120], 
			[-4636, -7476, 120], [-4399, -7496, 108], [-6769, -7571, 108], [-6853, -7377, 108], [-8273, -7231, 60], [-4182, -7512, 108], 
			[-7525, -5855, 108], [-7495, -6329, 60], [-7297, -6946, 108], [-8148, -7137, 84], [-7030, -7301, 84]],
        groundDoodads: [[-9670, -1470, "doodadField", .5, 0, null, null], [8600, -940, "doodadField", .5, 0, null, null], [920, -2800, "doodadField", .5, 0, null, null]],
        debug: {
            show: !0,
            collisions: !1
        },
        mobile: !1,
        ios: !1,
        phone: !1,
        tablet: !1,
        mouse: !1,
        resolution: 1,
        overdrawOptimize: !0,
        overdraw: 256,
        scalingFactor: 2500,
        minimapPaddingX: 16,
        minimapPaddingY: 16,
        minimapSize: 240,
        maxChatLines: 50,
        maxScoreboard: 8,
        shadowScaling: 2,
        shadowOffsetX: 20,
        shadowOffsetY: 40,
        ackFrequency: 10,
        bucketSize: 512,
        mapWidth: 32768,
        mapHeight: 16384
};

// end airmash client









// bot
	
var CommandExecutor = {};
var Behaviors = {};
var Bot = {};
var Config = {};
var BotWorker = {};
var Util = {};


//Util
(function(){
    
	function getPlayers() {
        var result = [];
        var playerIDs = Players.getIDs();
        for (var id in playerIDs) {
            if (playerIDs.hasOwnProperty(id)) {
                var p = Players.get(id);
                if (p) {
                    result.push(p);
                }
            }
        }
        return result;
    }
    
	Util.calcDiff = function(first, second) {
        var diffX = second.x - first.x;
        var diffY = second.y - first.y;
        var distance = Math.sqrt(diffX * diffX + diffY * diffY);
        return {
            diffX: diffX,
            diffY: diffY,
            distance: distance,
        };
    }
    
	Util.getPosition = function(what) {
        // accuracy
        var isAccurate = true;
        var pos = what.pos;
        if (what.lowResPos) {
            isAccurate = Util.calcDiff(what.lowResPos, what.pos).distance < 900 || what.render;
            pos = isAccurate ? pos : what.lowResPos;
        }
        return {
            x: pos.x,
            y: pos.y,
            isAccurate: isAccurate
        };
    }
    
	Util.getDeltaTo = function(what) {
        if (!what.pos && what.x && what.y) {
            what = { pos: what };
        }
        // accuracy
        var victimPos = Util.getPosition(what);
        var myPos = Players.getMe().pos;
        var delta = Object.assign({}, Util.calcDiff(myPos, victimPos), { isAccurate: victimPos.isAccurate });
        return delta;
    }

    Util.getHostilePlayersSortedByDistance = function(excludeID, includeIDs) {
        if (excludeID === void 0) { excludeID = null; }
        if (includeIDs === void 0) { includeIDs = null; }
        var allPlayers = getPlayers();
        var players = allPlayers.filter(function (p) {
            return p.team !== game.myTeam && p.id !== excludeID && (!includeIDs || includeIDs.indexOf(p.id) > -1);
        });
        players.sort(function (victimA, victimB) {
            var a = Util.getDeltaTo(victimA);
            var b = Util.getDeltaTo(victimB);
            if (a.isAccurate && !b.isAccurate) {
                return -1;
            }
            if (!a.isAccurate && b.isAccurate) {
                return 1;
            }
            if (a.distance < b.distance) {
                return -1;
            }
            if (b.distance < a.distance) {
                return 1;
            }
            return 0;
        });
        return players;
    };

})();

//BotWorker
(function(){
	
	const worker = _worker;
	var isReady = false;
	var lastRequestID = 0;
	var findPathCallback = null;
	var errorCallback = null;
	var lastAliveSignal = null;

    BotWorker.init = function() {
        var mountains = config.walls.map(function (x) {
            return {
                x: x[0],
                y: x[1],
                size: x[2]
            };
        });
        console.log("init worker");
        worker.postMessage(["setMountains", mountains]);
		worker.on('message', function (e) { return onWorkerMessage({data:e}); });
        worker.onerror = function (e) { throw "ABCDEF";/*return onError(e); */};
    }

	BotWorker.findPath = function (myPos, otherPos, startedDt, callback, _errorCallback) {
        if (!isReady) {
            return startedDt;
        }
        var pathFinderTimeout = 5000;
        if (startedDt) {
            if (Date.now() - startedDt < pathFinderTimeout) {
                return startedDt;
            }
            // timeout elapsed
            // but the worker may still be doing its calculation if it's heavy
            if (lastAliveSignal && Date.now() - lastAliveSignal < pathFinderTimeout) {
                // wait some more
                return startedDt;
            }
			throw "HHH";
        }

		// previous request canceled..
		//if (errorCallback)
			//errorCallback('cancel');
		
        lastRequestID++;
        findPathCallback = callback;
        errorCallback = _errorCallback;
        worker.postMessage(["findPath", { x: myPos.x, y: myPos.y }, { x: otherPos.x, y: otherPos.y }, lastRequestID]);

		return Date.now();
    };

    function onWorkerMessage(e) {
        var args = e.data;
        var action = args[0];
        if (action === "ERROR") {
            var requestID = args[2];
            if (requestID === lastRequestID) {
				if (log_enabled) console.log("Error calling worker.");
				var errorCallback = errorCallback;
				errorCallback = null;
				findPathCallback = null;
				if (errorCallback) {
					errorCallback();
				}
			}
        }
        else if (action === "READY") {
            console.log("worker ready!");
            isReady = true;
        }
        else if (action === "SIGNAL_ALIVE") {
            // worker is still working
            lastAliveSignal = Date.now();
        }
        else if (action === "findPath") {
            var path = args[1];
            var requestID = args[2];
            if (requestID === lastRequestID) {
                var callback = findPathCallback;
                findPathCallback = null;
                errorCallback = null;

				path.shift();//my own position

                callback(path);
            }
        }
    };
	
    function onError(error) {
    };
})();


//CommandExecutor
(function(){
	const rotationSpeeds = {
		1: 0.39,
		2: 0.24,
		3: 0.42,
		4: 0.33,
		5: 0.33
	};
    const mySpeed = rotationSpeeds[aircraft_type];
    const throttleInterval = 150;
	const pi = Math.atan2(0, -1);
	var state = { };

	function isThrottleTimeElapsedFor(what){
        return !state.nextMovementExec[what] || Date.now() > state.nextMovementExec[what];
	}
	function setThrottleTimeFor(what){
        state.nextMovementExec[what] = Date.now() + throttleInterval;
    }
	function isAnyThrottleTimeElapsed(){
        if (!state.nextMovementExec) {
            return true;
        }
        for (var _i = 0, _a = state.nextMovementExec; _i < _a.length; _i++) {
            var p = _a[_i];
            if (isThrottleTimeElapsedFor(p)) {
                return true;
            }
        }
        return false;
	}
    
	CommandExecutor.getState = function(){
		return state;
	}
    
	CommandExecutor.getRotDelta = function(myRot, desRot){
        var rotDiff = Math.abs(myRot - desRot);
        var direction;
        if (myRot > desRot) {
            if (rotDiff > pi) {
                direction = "RIGHT";
                //rotDiff = rotDiff - pi;
            }
            else {
                direction = "LEFT";
            }
        }
        else if (myRot < desRot) {
            if (rotDiff > pi) {
                direction = "LEFT";
                //rotDiff = rotDiff - pi;
            }
            else {
                direction = "RIGHT";
            }
        }
		rotDiff = Math.min((2 * pi) - rotDiff, rotDiff); //https://stackoverflow.com/questions/1878907/the-smallest-difference-between-2-angles
        return { direction: direction, rotDiff: rotDiff };
    };
    
	function turnToDesiredAngle(desRot) {
        if (state.angleTimeout) {
            // still turning
            return false;
        }
        var rotDelta = CommandExecutor.getRotDelta(Players.getMe().rot, desRot);
        if (rotDelta.rotDiff > Config.precision) {
            var msNeededToTurn = (rotDelta.rotDiff / mySpeed) * 100;
			const newdir = rotDelta.direction === "LEFT" ? "RIGHT" : "LEFT";
			if (state.lastdir == newdir){
				state.lastdircount++;
			} else {
				state.lastdir = newdir;
				state.lastdircount = 0;
			}
            Network.sendKey(newdir, false);
            Network.sendKey(rotDelta.direction, true);
            var myTimeout = setTimeout(function () {
                Network.sendKey(rotDelta.direction, false);
                state.desiredAngle = undefined; // as opposed to null, because NaN(null) === false
                // wait ping before next update, to know our real angle
                state.angleTimeout = setTimeout(function () { return state.angleTimeout = null; }, game.ping);
            }, msNeededToTurn);
            state.angleTimeout = myTimeout;
        }
		return true;
    };
	
	CommandExecutor.getAngle = function(what){
        var delta = Util.getDeltaTo(what);
        var targetDirection = Math.atan2(delta.diffX, -delta.diffY);
        if (targetDirection < 0) {
            targetDirection = pi * 2 + targetDirection;
        }
		return targetDirection;
	};

	CommandExecutor.setDesiredAngle = function(angle){
		state.desiredAngle = angle;
	};

	CommandExecutor.setSpeedMovement = function(val){
		state.speedMovement = val;
	};
	CommandExecutor.getSpeedMovement = function(){
		return state.speedMovement;
	};
	CommandExecutor.getPreviousSpeedMovement = function(){
		return state.previousSpeedMovement;
	};
    
	CommandExecutor.setFire = function(isFiring, stopFiringTimeout) {
        if (stopFiringTimeout === void 0) { stopFiringTimeout = null; }
        state.isFiring = isFiring;
        state.stopFiringTimeout = stopFiringTimeout;
    };
    
	CommandExecutor.setWhomp = function() {
        state.whomp = true;
    };
    
	CommandExecutor.setFastMovement = function(fast) {
        state.fast = fast;
    };
	
	CommandExecutor.setFlybackwards = function() {
        state.flybackwards = true;
    };

	CommandExecutor.clear = function(angle){
		state = {};
		//clearCommands
        Network.sendKey("LEFT", false);
        Network.sendKey("RIGHT", false);
        Network.sendKey("UP", false);
        Network.sendKey("DOWN", false);
        Network.sendKey("FIRE", false);
        Network.sendKey("SPECIAL", false);
	};

    CommandExecutor.executeCommands = function(isPlayerCarryingFlag) {
        if (!state.nextMovementExec) {
            state.nextMovementExec = {};
        }
        var desiredAngleChanged = state.lastDesiredAngle !== state.desiredAngle;
        var movementChanged = state.previousSpeedMovement !== state.speedMovement;
        var fireChanged = state.previousIsFiring !== state.isFiring;
        var whompChanged;
        if (Config.useSpecial === "WHOMP") {
            whompChanged = state.previousWhomp !== state.whomp;
        }
        var fastChanged;
        if (Config.useSpecial === "SPEED") {
            fastChanged = state.previousFast !== state.fast;
        }
        var desiredAngle = state.desiredAngle;
        var desiredMovement = state.speedMovement;
        var previousMovement = state.previousSpeedMovement;
        if (state.flybackwards) {
            if (desiredAngle) {
                if (desiredAngle > pi) {
                    desiredAngle -= pi;
                }
                else {
                    desiredAngle += pi;
                }
            }
            if (desiredMovement) {
                if (desiredMovement === "UP") {
                    desiredMovement = "DOWN";
                }
                else {
                    desiredMovement = "UP";
                }
            }
            if (previousMovement) {
                if (previousMovement === "UP") {
                    previousMovement = "DOWN";
                }
                else {
                    previousMovement = "UP";
                }
            }
        }
        if (desiredAngleChanged || movementChanged || fastChanged || fireChanged || whompChanged || isAnyThrottleTimeElapsed()) {
            if (movementChanged) {
                if (previousMovement) {
                    Network.sendKey(previousMovement, false);
                }
                state.previousSpeedMovement = state.speedMovement;
            }
            if (desiredAngleChanged) {
                //state.lastDesiredAngle = state.desiredAngle;
            }
            if (fastChanged) {
                state.previousFast = state.fast;
            }
            if (fireChanged) {
                state.previousIsFiring = state.isFiring;
            }
            if (!isNaN(state.desiredAngle) && (desiredAngleChanged || isThrottleTimeElapsedFor("angle"))) {
                if (turnToDesiredAngle(desiredAngle)){
	                setThrottleTimeFor("angle");
					state.lastDesiredAngle = state.desiredAngle;
				}
            }
            if (state.speedMovement && (movementChanged || isThrottleTimeElapsedFor("movement"))) {
                Network.sendKey(desiredMovement, true);
                setThrottleTimeFor("movement");
            }
            if (Config.useSpecial === "SPEED" && !isPlayerCarryingFlag) {
                if (fastChanged || isThrottleTimeElapsedFor("fast")) {
                    if (state.fast) {
                        if (!state.fastTimeout) {
                            Network.sendKey("SPECIAL", true);
                            state.fastTimeout = setTimeout(function () {
                                Network.sendKey("SPECIAL", false);
                                state.fastTimeout = null;
                            }, 1000);
                        }
                    }
                    else {
                        Network.sendKey("SPECIAL", false);
                    }
                    setThrottleTimeFor("fast");
                }
            }
            if (fireChanged || isThrottleTimeElapsedFor("fire")) {
                var fireKey_1 = "FIRE";
                //if (Config.useSpecial === "FIRE") {tornado...
                    //fireKey_1 = "SPECIAL";
                //}
                if (state.isFiring) {
                    Network.sendKey(fireKey_1, true);
                    // don't turn the firebutton off if fireConstantly is on
                    if (!turret /*!Config.fireConstantly*/) {
                        if (!state.fireTimeout) {
                            var stopFiringTimeout = state.stopFiringTimeout || 1200;
                            state.fireTimeout = setTimeout(function () {
                                state.fireTimeout = null;
                                Network.sendKey(fireKey_1, false);
                                state.isFiring = false;
                            }, stopFiringTimeout);
                        }
                    }
                }
                else {
                    Network.sendKey(fireKey_1, false);
                }
                setThrottleTimeFor("fire");
            }
            // don't repeat following special commands on throttle elapsed, because they work one time only
            var doSpecial = false;
            if (Config.useStealth && Config.useSpecial === "STEALTH" && !Players.getMe().stealthed) {
                doSpecial = true;
            }
            if (whompChanged) {
                doSpecial = true;
                state.whomp = false;
                state.previousWhomp = false;
            }
            if (doSpecial) {
                if (log_enabled) console.log("Sending special");
                Network.sendKey("SPECIAL", true);
                setTimeout(function () { return Network.sendKey("SPECIAL", false); }, 100);
            }
        }
	};

})();

//Config
(function() {
	var normalBotConfig = {
		distanceNear: 450,
		distanceClose: 300,
		distanceTooClose: 200,
		distanceZero: 50,
		heartbeatInterval: 75,
		name: "normal",
		precision: 0.1,
		throttleInterval: 150,
		respawnTimeout: 4000,
		useSpecial: "SPEED",
		useStealth: false,
		aircraftType: 1
	};
    var agressiveBotConfig = Object.assign({}, normalBotConfig, {
		distanceTooClose: 50,
		name: "agressive",
		precision: 0.15,
	});
	var copterBotConfig = Object.assign({}, normalBotConfig, {
		distanceTooClose: 400,
		name: "copter",
		useSpecial: null,
		aircraftType: 3
	});
	var tornadoBotConfig = Object.assign({}, normalBotConfig, {
		distanceTooClose: 100,
		name: "tornado",
		useSpecial: "FIRE",
		aircraftType: 4
	});
	var prowlerBotConfig = Object.assign({}, normalBotConfig, {
		distanceNear: 300,
		distanceClose: 200,
		distanceTooClose: 50,
		name: "prowler",
		useStealth: true,
		useSpecial: "STEALTH",
		aircraftType: 5
	});
	var goliathBotConfig = Object.assign({}, normalBotConfig, {
		distanceNear: 500,
		distanceClose: 300,
		distanceTooClose: 150,
		name: "goliath",
		useSpecial: "WHOMP",
		aircraftType: 2
	});
	switch (aircraft_type) {
		case 1:
			Config = agressiveBotConfig;
			break;
		case 2:
			Config = goliathBotConfig;
			break;
		case 3:
			Config = copterBotConfig;
			break;
		case 4:
			Config = tornadoBotConfig;
			break;
		case 5:
			Config = prowlerBotConfig;
			break;
		default:
			throw "unknown aircraft_type";
	}
})();

//Behaviors
(function(){
	const missilesTypes = [ 1, 2, 3, 5, 6, 7, ];
	const powerupTypes  = [ 4, 8, 9, ]; 
	const pi = Math.atan2(0, -1);

	let last_m_fleed_id = null;
	let closest_mob_id = null;//upgrade or powerup
	let victim_id_exclude = null;
	let ctf_target_id = null;

	function get_flag(team){
        if (team === 2) {
            return FlagStatus.flagRed;
        }
        return FlagStatus.flagBlue;
	}

	function last_m_intersect(my_rot, my_movement){
		if (!last_m_fleed_id) return false;
    	const m = Mobs.get(last_m_fleed_id);
		if (!m)
			return false;
				
		const my_pos = Players.getMe().pos;
		
		const seg_len = 800;
		const missile_angle = 2*pi - m.spriteRot + pi/2;
		const m_start_x = m.pos.x;
		const m_start_y = m.pos.y;
		const m_end_x = m_start_x + seg_len * Math.cos(missile_angle);
		const m_end_y = -(-m_start_y + seg_len * Math.sin(missile_angle));

		const my_seg_len = 500;
		const my_angle = my_movement == "DOWN" ? pi - my_rot + pi/2 : 2*pi - my_rot + pi/2;
		//const my_start_x = my_pos.x;
		//const my_start_y = my_pos.y;
		const my_start_x = my_pos.x + 20 * Math.cos(my_angle+pi);
		const my_start_y = -(-my_pos.y + 20 * Math.sin(my_angle+pi));
		const my_end_x = my_start_x + my_seg_len * Math.cos(my_angle);
		const my_end_y = -(-my_start_y + my_seg_len * Math.sin(my_angle));

		const t_len_half = 40;
		const t_start_x = my_start_x + (t_len_half)*Math.cos(my_angle-pi/2);
		const t_start_y = -(-my_start_y + (t_len_half)*Math.sin(my_angle-pi/2));
		const t_end_x = my_start_x + (t_len_half)*Math.cos(my_angle+pi/2);
		const t_end_y = -(-my_start_y + (t_len_half)*Math.sin(my_angle+pi/2));
					
		if (getLineIntersection(m_start_x, m_start_y, m_end_x, m_end_y, t_start_x, t_start_y, t_end_x, t_end_y) ||
			getLineIntersection(m_start_x, m_start_y, m_end_x, m_end_y, my_start_x, my_start_y, my_end_x, my_end_y)
		){
			return true;
		}

		return false;
	}

	function selectVictim(currentVictim){
		function isVictimValid(victim){
			var isActive = !!Players.get(victim.id);
			var isProwler = victim.type === 5;
			var isVictimImmune = victim.status == 1 || victim.removedFromMap; /*|| !victim.render*/
			if (!isActive || isProwler || isVictimImmune) {
				return false;
			}
			if (victim_id_exclude && victim_id_exclude === victim.id){
				return false;
			}
			if (victim.id == game.myID){
				return false;
			}
            if (victim.team == game.myTeam){
				return false;
			}
			if (!turret && !follow_name && currentVictim && currentVictim.id == victim.id && CommandExecutor.getState().lastdircount > 70){
				if (log_enabled) console.log('loop detected');
				victim_id_exclude = victim.id;
				setTimeout(()=>victim_id_exclude = null, 4000);
				return false;
			}
			return true;
		}

		let new_victim = null;

		//ctf
		if (ctf_target_id){
			let p = Players.get(ctf_target_id);
			if (p && isVictimValid(p)){
				new_victim = p;
			}
		}

		//target
		if (!new_victim && target_name){

			if (target_name == 'humans'){
				let players = Util.getHostilePlayersSortedByDistance();
				let my_flag = Players.getMe().flag;
				for (let i=0; i<players.length; i++){//get first valid
					let p = players[i];
					if (!p)
						continue;
					if (p.name.indexOf('0') === 0 && p.flag == my_flag)
						continue;
					if (p.name.indexOf('#') !== -1 && p.flag == 10)
						continue;
					if (isVictimValid(p)){
						new_victim = p;
						break;
					}
				}
			} else {
				let p = target_name == 'leader' ? Players.get(leader_id) : Players.getByName(target_name);
				if (p && isVictimValid(p)){
					new_victim = p;
				}
			}
		}

		if (!new_victim){
			let players = Util.getHostilePlayersSortedByDistance();
			for (let i=0; i<players.length; i++){//get first valid
				let p = players[i];
				if (!p)
					continue;
				if (isVictimValid(p)){
					new_victim = p;
					break;
				}
			}
		}

		if (!currentVictim || !isVictimValid(currentVictim)){
		} else {
			if (!follow_name && !target_name && new_victim && new_victim.id != currentVictim.id){
				let victimDistance = Util.getDeltaTo(currentVictim);
				let closestPlayerDistance = Util.getDeltaTo(new_victim);
				let shouldSwitch = void 0;
				if (!closestPlayerDistance.isAccurate || victimDistance.distance < Config.distanceClose) {
					shouldSwitch = false;
				}
				else if (closestPlayerDistance.isAccurate && !victimDistance.isAccurate) {
					if (log_enabled) console.log("switch: " + new_victim.name + " is more accurate");
					shouldSwitch = true;
				}
				else if (closestPlayerDistance.distance / victimDistance.distance < 0.2) {
					if (log_enabled) console.log("switch: " + new_victim.name + " is way closer");
					shouldSwitch = true;
				}
				if (!shouldSwitch) {
					new_victim  = currentVictim;
				}
			}
		}

		return new_victim ? Players.get(new_victim.id) : null;
	}

	function selectVictimCtf(){
	}

	// https://stackoverflow.com/questions/563198/how-do-you-detect-where-two-line-segments-intersect#
	function getLineIntersection(p0_x, p0_y, p1_x, p1_y, p2_x, p2_y, p3_x, p3_y, return_point=false) { 
		var s1_x, s1_y, s2_x, s2_y; 
		s1_x = p1_x - p0_x; 
		s1_y = p1_y - p0_y; 
		s2_x = p3_x - p2_x; 
		s2_y = p3_y - p2_y; 
		var s, t;
		s = (-s1_y * (p0_x - p2_x) + s1_x * (p0_y - p2_y)) / (-s2_x * s1_y + s1_x * s2_y); 
		t = ( s2_x * (p0_y - p2_y) - s2_y * (p0_x - p2_x)) / (-s2_x * s1_y + s1_x * s2_y); 
		if (s >= 0 && s <= 1 && t >= 0 && t <= 1) { 
			// Collision detected 
			if (return_point){
				var intX = p0_x + (t * s1_x); 
				var intY = p0_y + (t * s1_y); 
				return [intX, intY]; 
			} else
				return true;
		} return null; // No collision 
	}
	
	//function is_near_walls(x, y){
		//for (let w of config.walls){
			//if (Math.abs(w[0]-x) < w[2] && Math.abs(w[1]-y) < w[2])
				//return true;
		//}
		//return false;
	//}
    
	// lower included, upper not
	function getRandomNumber(lower, upper) {
        return lower + Math.floor(Math.random() * (upper - lower));
    }

	Behaviors = {
		default: {
			detect: function(){
				return true;
			},
			handle: function(){
				CommandExecutor.setSpeedMovement(null);
			},
		},
		
		defend: {
			detect: function(cur_behavior, state, conf, active_is_set){
				if (active_is_set) return false;
				// todo
			},
			handle: function(state, conf){
				// todo
			},
		},

		recap: {
			detect: function(cur_behavior, state, conf, active_is_set){
				//if (active_is_set) return false;

				let flag = get_flag(Players.getMe().team);
				ctf_target_id = flag.playerId;
				if (ctf_target_id){
					let p = Players.get(ctf_target_id);
					if (p.team == game.myTeam)
						ctf_target_id = null;
				}

				target_coords = null;
				if (!ctf_target_id){
					//flagRed: {
						//visible: !1,
						//playerId: null,
						//direction: 1,
						//diffX: 0,
						//momentum: 0,
						//position: Vector.zero(),
						//basePos: new Vector(8602,-944),
					if (Math.abs(flag.position.x - flag.basePos.x) > 200 || Math.abs(flag.position.y - flag.basePos.y) > 200 ){
						target_coords = {pos:{x:flag.position.x, y:flag.position.y}};
					}
				}

				return false;
			},
			handle: function(state, conf){
			},
		},

		chase_victim: {
			detect: function(cur_behavior, state, conf, active_is_set){
				if (active_is_set)
					return false;
				
				function isSamePlayer(a, b){
					if (a && !b || !a && b) {
						return false;
					}
					if (!a && !b) {
						return true;
					}
					return a.id === b.id;
				}
				
				let victim = selectVictim(state.victim);
				if (!isSamePlayer(victim, state.victim)){
					if (victim)
						if (log_enabled) console.log("new victim:", victim.id, victim.name, victim.status);
					else
						if (log_enabled) console.log("no victims found");

					this.unhandle(state);
				}
				state.victim = victim;
				if (state.victim){
					return true;
				}else {
					return false;
				}
			},
			unhandle: function(state){
				state.victim = null;
				state.pathToVictim = null;
				state.startedFindingPathToVictim = null;
				CommandExecutor.getState().lastdircount = 0;
			},
			handle: function(state, conf){
				if (!state.victim) throw "assert failed";
					
				let whatDelta = Util.getDeltaTo(state.victim);

				let bounced = game.time - Players.getMe().state.lastBounceSound < 300;

				//findPathToVictim
				if (bounced && !state.pausePathFinding){
					if (log_enabled) console.log(">EE", 'findPath');
					let otherPos = Util.getPosition(state.victim);
					let myPos = Players.getMe().pos;
					state.startedFindingPathToVictim = BotWorker.findPath(myPos, otherPos, state.startedFindingPathToVictim, function (path) {
						if (!state.startedFindingPathToVictim) return; //canceled..
						if (log_enabled) console.log(">EE", 'findPathToVictim ok');
						state.startedFindingPathToVictim = null;
						state.pathToVictim = path;
						let wait = whatDelta.distance < Config.distanceNear ? 300 : 800;
						state.pausePathFinding = true;
						setTimeout(()=>state.pausePathFinding=false, wait);
					}, function () {
						if (log_enabled) console.log(">EE", 'findPathToVictim err');
						state.startedFindingPathToVictim = null;
						state.pathToVictim = null;
					});
				}


				let target = null;
				if (state.pathToVictim && state.pathToVictim.length > 0){
					target = state.pathToVictim[0];
					//update path
					let delta = Util.getDeltaTo(target);
					if (delta.distance <= Config.distanceZero) {
						state.pathToVictim.shift();
					}
				} else {
					target = state.victim;
				}
				
				let new_angle = CommandExecutor.getAngle(target);
				
				let direction;
				let fast = false;
				if ((state.victim.powerups.rampage || state.victim.powerups.shield) && whatDelta.distance < Config.distanceNear && !Players.getMe().powerups.shield && !follow_name) {
					direction = "DOWN";
				} else if (whatDelta.distance < 400 && Players.getMe().health < 0.7 && !follow_name) {
					direction = "DOWN";
				} else {
					direction = "UP";
				}
				
				if (!turret && last_m_intersect(new_angle, direction)){
					return;
				}

				if (ctf_target_id && whatDelta.distance > 450){
					fast = true;
				}

				if (!turret){
					CommandExecutor.setFastMovement(fast);
					CommandExecutor.setSpeedMovement(direction);
				} else {
					CommandExecutor.setFastMovement(false);
					CommandExecutor.setSpeedMovement(null);
				}
				CommandExecutor.setDesiredAngle(new_angle);
				
				//fire
				if (conf.fire && !follow_name){
					if (ctf_target_id && whatDelta.distance > 450){
					} else {
						CommandExecutor.setFire(true, 1000);
					}
				} else {
					CommandExecutor.setFire(false, 1000);
				}
			},
		},
		
		upgrades: {
			detect: function(cur_behavior, state, conf, active_is_set){
				if (active_is_set) return false;
				return bot_upgrades > 0;
			},
			handle: function(state, conf){
				Network.sendCommand("upgrade", getRandomNumber(1,5) + "");
				bot_upgrades--;
			},
		},

		chase_mob: {
			detect: function(cur_behavior, state, conf, active_is_set){
				if (active_is_set) return false;
				if (!closest_mob_id || turret || follow_name)
					return false;
				const m = Mobs.get(closest_mob_id);
				if (!m){
					closest_mob_id = null;
					return false;
				}
				return true;
			},
			unhandle: function(state){
				state.pathToMob = null;
				state.startedFindingPathToMob = null;
				//CommandExecutor.setFastMovement(false);
			},
			handle: function(state, conf){
				let target = Mobs.get(closest_mob_id);
				
				let bounced = game.time - Players.getMe().state.lastBounceSound < 300;
				if (bounced && !state.pausePathFinding){
					if (log_enabled) console.log(">EE", 'findPath');
					let otherPos = Util.getPosition(target);
					let myPos = Players.getMe().pos;
					state.startedFindingPathToMob = BotWorker.findPath(myPos, otherPos, state.startedFindingPathToMob, function (path) {
						if (!state.startedFindingPathToMob) return; //canceled..
						if (log_enabled) console.log(">EE", 'findPath ok');
						state.startedFindingPathToMob = null;
						state.pathToMob = path;
						//let wait = whatDelta.distance < Config.distanceNear ? 300 : 800;
						let wait = 300;
						state.pausePathFinding = true;
						setTimeout(()=>state.pausePathFinding=false, wait);
					}, function () {
						if (log_enabled) console.log(">EE", 'findPathTo err');
						state.startedFindingPathToMob = null;
						state.pathToMob = null;
					});
				}

				if (state.pathToMob && state.pathToMob.length > 0){
					target = state.pathToMob[0];
					//update path
					let delta = Util.getDeltaTo(target);
					if (delta.distance <= Config.distanceZero) {
						state.pathToMob.shift();
					}
				}

				let new_angle = CommandExecutor.getAngle(target);
				let direction = "UP";
				
				if (last_m_intersect(new_angle, direction)){
					return;
				}
				
				CommandExecutor.setSpeedMovement(direction);
				CommandExecutor.setDesiredAngle(new_angle); 
				//CommandExecutor.setFastMovement(true);
			},
		},

		goto_coords: {
			detect: function(cur_behavior, state, conf, active_is_set){
				if (active_is_set) return false;
				return !!target_coords;
			},
			unhandle: function(state){
				state.pathToCoords = null;
				state.startedFindingPathToCoords = null;
			},
			handle: function(state, conf){
				let target = target_coords;

				let bounced = game.time - Players.getMe().state.lastBounceSound < 300;
				if (bounced && !state.pausePathFinding){
					if (log_enabled) console.log(">EE", 'findPath');
					let otherPos = Util.getPosition(target);
					let myPos = Players.getMe().pos;
					state.startedFindingPathToCoords = BotWorker.findPath(myPos, otherPos, state.startedFindingPathToCoords, function (path) {
						if (!state.startedFindingPathToCoords) return; //canceled..
						if (log_enabled) console.log(">EE", 'findPath ok');
						state.startedFindingPathToCoords = null;
						state.pathToCoords = path;
						//let wait = whatDelta.distance < Config.distanceNear ? 300 : 800;
						let wait = 300;
						state.pausePathFinding = true;
						setTimeout(()=>state.pausePathFinding=false, wait);
					}, function () {
						if (log_enabled) console.log(">EE", 'findPathTo err');
						state.startedFindingPathToCoords = null;
						state.pathToCoords = null;
					});
				}

				if (state.pathToCoords && state.pathToCoords.length > 0){
					target = state.pathToCoords[0];
					//update path
					let delta = Util.getDeltaTo(target);
					if (delta.distance <= Config.distanceZero) {
						state.pathToCoords.shift();
					}
				}

				let new_angle = CommandExecutor.getAngle(target);
				let direction = "UP";
				
				if (last_m_intersect(new_angle, direction)){
					return;
				}
					
				CommandExecutor.setSpeedMovement(direction);
				if (new_angle !== null)
					CommandExecutor.setDesiredAngle(new_angle); 
				//CommandExecutor.setFastMovement(true);
				
				//fire
				if (false){
					CommandExecutor.setFire(true, 1000);
				} else {
					CommandExecutor.setFire(false, 1000);
				}
			},
		},
		
		cycle_path: {
			detect: function(cur_behavior, state, conf, active_is_set){
				if (active_is_set) return false;
				return !!target_path || (conf||{}).path;
			},
			handle: function(state, conf){

				const path = target_path || conf.path;

				state.cur_idx = state.cur_idx || 0;
				let poi = {pos:path[state.cur_idx]};
				let delta = Util.getDeltaTo(poi);
				if (delta.distance <= Config.distanceZero) {
					state.cur_idx = (state.cur_idx+1) % path.length;
				}
				poi = {pos:path[state.cur_idx]};
				
				let new_angle = CommandExecutor.getAngle(poi);
				let direction = "UP";

				if (last_m_intersect(new_angle, direction)){
					return;
				}
				
				//if (delta.distance > this.config.distanceNear) {
					//CommandExecutor.setFastMovement(fast);
				//}
				CommandExecutor.setSpeedMovement(direction);
				CommandExecutor.setDesiredAngle(new_angle);
			},
		},

		flee: {
			detect: function(cur_behavior, state, conf, active_is_set){
				if (active_is_set)
					return false;
				if (Players.getMe().powerups.shield)
					return false;
				if (follow_name || turret)
					return false;

				let min_distance = 999999;
				let min_mob = null;
				let sign, start_rot;//hor
				let int_type;
				let new_angle = null;
				let new_movement = "UP";
				let fast_movement = false;
				let my_pos = Players.getMe().pos;
				let my_rot = Players.getMe().rot;
				let mobs = Mobs.mobs();
				//let m_old = null;
				for (let mob_id in mobs){
					let m = mobs[mob_id];
					if (m.state.inactive)
						continue;
					if (!m.missile){
						const _delta = Util.calcDiff(my_pos, m.pos);
						if (_delta.distance < 400)
							closest_mob_id = m.id;
						continue;
					}
					if (m.playerID === game.myID) {//my missile
						continue;
					}
					if (game.gameType === 2) {//ctf...
						let player = Players.get(m.playerID);
						if (player && player.team === game.myTeam) {
							// friendly fire
							continue;
						}
					}
					let delta = Util.calcDiff(my_pos, m.pos);
					if (delta.distance >= min_distance){
						continue;
					}
					//if (state.objectToFleeFromID && state.objectToFleeFromID == mob_id && delta.distance < 100){
						//m_old = m;
					//}

					//spriteRot: up=0 right=1.56/90 down=3.14/180
					//mapProperties: { left: -16352, top: -8160, right: 16352, bottom: 8160 },

					// missile segment
					const seg_len = 800;
					const missile_angle = 2*pi - m.spriteRot + pi/2;
					const m_start_x = m.pos.x;
					const m_start_y = m.pos.y;
					const m_end_x = m_start_x + seg_len * Math.cos(missile_angle);
					const m_end_y = -(-m_start_y + seg_len * Math.sin(missile_angle));

					// my segment
					const my_seg_len = 500;
					const my_angle = CommandExecutor.getSpeedMovement() == "DOWN" ? pi - my_rot + pi/2 : 2*pi - my_rot + pi/2;
					const my_start_x = my_pos.x + 20 * Math.cos(my_angle+pi);
					const my_start_y = -(-my_pos.y + 20 * Math.sin(my_angle+pi));
					const my_end_x = my_start_x + my_seg_len * Math.cos(my_angle);
					const my_end_y = -(-my_start_y + my_seg_len * Math.sin(my_angle));

					const t_len_half = aircraft_type == 2 ? 80 : 40;
					const t_start_x = my_start_x + (t_len_half)*Math.cos(my_angle-pi/2);
					const t_start_y = -(-my_start_y + (t_len_half)*Math.sin(my_angle-pi/2));
					const t_end_x = my_start_x + (t_len_half)*Math.cos(my_angle+pi/2);
					const t_end_y = -(-my_start_y + (t_len_half)*Math.sin(my_angle+pi/2));
	
					let int_point;
					
					// hor intersection
					if ((int_point = getLineIntersection(m_start_x, m_start_y, m_end_x, m_end_y, t_start_x, t_start_y, t_end_x, t_end_y, true)) && !(state.objectToFleeFromID == m.id && state.int_type == 'ver')){
						min_distance = delta.distance;
						min_mob = m;
						int_type = 'hor';

						let a_step = 0.52;//0.52=30deg

						if (state.objectToFleeFromID == m.id && state.sign){
							sign = state.sign;
							new_movement = state.new_movement;
							let rot_diff = CommandExecutor.getRotDelta(my_rot, state.start_rot).rotDiff;
							if (rot_diff > 1.56)//turn max 90deg
								a_step = 0;
						} else {
							sign = (t_end_x - t_start_x) > 0 ? 1 : -1; 
							sign = int_point[0] > my_pos.x ? sign*1 : sign*(-1);
							start_rot = my_rot;
							
							if (CommandExecutor.getSpeedMovement() == "DOWN"){
								new_movement = "DOWN";
								sign = -sign;
							} else {
								let rot_diff = CommandExecutor.getRotDelta(my_rot, m.spriteRot).rotDiff;
								if (rot_diff > 1.56 && delta.distance < 200 ){
									new_movement = "DOWN";
									sign = -sign;
								}
							}

						}
						
						new_angle = my_rot + (sign * a_step);

						if (aircraft_type == 2 && min_distance < 150){
							fast_movement = true;
						} else if (aircraft_type != 2) {
							if (min_distance < 100)
								fast_movement = true;
						}
						
					}
					// ver intersection
					else if (!(state.objectToFleeFromID == m.id && state.int_type == 'hor')) {

						let start_x = null, start_y, end_x, end_y;
						if (int_point = getLineIntersection(m_start_x, m_start_y, m_end_x, m_end_y, my_start_x, my_start_y, my_end_x, my_end_y, true)){
							start_x = my_start_x;
							start_y = my_start_y;
							end_x = my_end_x;
							end_y = my_end_y;
						}


						if (start_x !== null){
							min_distance = delta.distance;
							min_mob = m;
							int_type = 'ver';
						
							if (false && state.objectToFleeFromID == m.id && state.flee_new_angle /*&& delta.distance > 300*/){
								new_angle = state.flee_new_angle;
								new_movement = state.new_movement;
							
							} else {
								const step = 30 * (pi/180);
								for (let i=0; i<2*pi; i += step){
									let my_new_angle = 2*pi - (my_rot+i) + pi/2;
									let my_new_end_x = start_x + seg_len * Math.cos(my_new_angle);
									let my_new_end_y = -(-start_y + seg_len * Math.sin(my_new_angle));
									if (!getLineIntersection(m_start_x, m_start_y, m_end_x, m_end_y, start_x, start_y, my_new_end_x, my_new_end_y)){
										new_angle = my_rot+i;
										break;
									}

									//try other direction
									my_new_angle = 2*pi - (my_rot-i) + pi/2;
									my_new_end_x = start_x + seg_len * Math.cos(my_new_angle);
									my_new_end_y = -(-start_y + seg_len * Math.sin(my_new_angle));
									if (!getLineIntersection(m_start_x, m_start_y, m_end_x, m_end_y, start_x, start_y, my_new_end_x, my_new_end_y)){
										new_angle = my_rot-i;
										break;
									}
								}
								if (!new_angle){
									throw "new angle...";
								}


								if (Util.calcDiff(my_pos, {x:int_point[0], y:int_point[1]}).distance < 200 && delta.distance < 400){
									new_movement = new_movement == "UP" ? "DOWN" : "UP";
								}

							}
						}
					}

				}
				if (!min_mob){
					return false;
				} else {
					last_m_fleed_id = min_mob.id;
					state.objectToFleeFromID = min_mob.id;
					state.flee_new_angle = new_angle;
					state.new_movement = new_movement;
					state.fast_movement = fast_movement;
					state.int_type = int_type;
					state.sign = sign;
					state.start_rot = start_rot;
					return true;
				}
			},
			handle: function(state, conf){
				if (!state.objectToFleeFromID) throw "assert failed";

				CommandExecutor.setDesiredAngle(state.flee_new_angle);
				CommandExecutor.setSpeedMovement(state.new_movement);
				if (aircraft_type == 2){
					if (state.fast_movement)
						CommandExecutor.setWhomp();
				} else
					CommandExecutor.setFastMovement(state.fast_movement);
			},
		},
		
	};
})();

//Bot
(function() {

	var heartbeat_interval = null;
	var active_behavior_idx = 0;

	function set_active_behavior(idx){
		if (idx == active_behavior_idx)
			return;
		if (Behaviors[cur_behaviors[active_behavior_idx].name].unhandle)
			Behaviors[cur_behaviors[active_behavior_idx].name].unhandle(cur_behaviors[active_behavior_idx].state);
		active_behavior_idx = idx;
	}
	var ffa_behaviors = [
		{name:'goto_coords'}, 
		{name:'cycle_path'/*, conf:{path:[{x:1000,y:0}, {x:-1000,y:0}]}*/},
		{name:'flee'},
		{name:'chase_mob'}, 
		{name:'upgrades'}, 
		{name:'chase_victim',conf:{fire:true}}, 
		{name:'default'}, 
	];
	var ctf_behaviors = [
		{name:'flee'},
		{name:'recap'},
		{name:'goto_coords'}, 
		{name:'chase_victim',conf:{fire:true}}, 
		{name:'default'}, 
	];
	var cur_behaviors = [];

    function init() {
		console.log("Bot init");

		BotWorker.init();

		// hooks
		
		playerKilled = function(data, dead, killer){
			if (dead.id === game.myID) {
				if (log_enabled) console.log("I was killed. Restarting.", kills+"/"+deaths);
				Bot.clear();
				setTimeout(Bot.start, Config.respawnTimeout);
			} else {
				if (log_enabled) console.log("player killed:", dead.id, kills+"/"+deaths);
			}
		}
		
		playerImpacted = function(data){
		}
		
		CTF_MatchStarted = function(){
		}
		
		CTF_MatchEnded = function(){
		}
	};
	if (_test)
		setTimeout(init, 100);

	Bot.heartbeat = function(){
		let b_active = cur_behaviors[active_behavior_idx];
		
		let active_is_set = false;
		for (let i=0; i<cur_behaviors.length; i++){
			let b = cur_behaviors[i];
			let active = Behaviors[b.name].detect(b_active.name, b.state, b.conf, active_is_set);
			if (!active_is_set && active){
				set_active_behavior(i);
				active_is_set = true;
				b_active = cur_behaviors[i];
			}
		}
		if (!active_is_set){
			throw "??";
		}
		
		Behaviors[b_active.name].handle(b_active.state, b_active.conf);
		
		CommandExecutor.executeCommands();
	},

	Bot.start = function(){
		if (log_enabled) console.log("Bot.main");

		cur_behaviors = [];
        if (game.gameType == 2)
			for (let b of ctf_behaviors) cur_behaviors.push({name:b.name, state:{}, conf:b.conf});
		else
			for (let b of ffa_behaviors) cur_behaviors.push({name:b.name, state:{}, conf:b.conf});

		set_active_behavior(cur_behaviors.length-1);

		Bot.ready = true;
		heartbeat_interval = setInterval(Bot.heartbeat, 60);
	};

	Bot.clear = function(){
		if (log_enabled) console.log("Bot.clear");
		clearInterval(heartbeat_interval);
		heartbeat_interval = null;
		CommandExecutor.clear();
	};
})();
