
install nodejs 12.x and run

```npm install```

run 10 bots 
```node --experimental-worker master.js -aircraft=1 -max=10```

aircraft can be 1=predator, 2=goliath, 3=mohawk, 4=tornado

specify websocket url
```node --experimental-worker master.js -aircraft=1 -max=10 -ws=ws://localhost:3501/```

run 10 spatiebots
```node --experimental-worker master.js -aircraft=1 -max=10 -type=spatiebot ```


