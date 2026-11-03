# 63: Office Hell

Open `63_ Office Hell.html` in a browser to play alone. It's live at http://31.97.38.206/officehell/.

## Merge Conflict (team vs team)

**MERGE CONFLICT** on the title screen: two teams, **MASTER** and **SANDBOX**, on a new map, "Burdzgla St.":
two office buildings facing each other across the street. MASTER has the 63 office (open space, meeting room,
boss office, the lounge with the dino wall, reception, kitchen, stairwell, the Red Corner). SANDBOX has the
mirror image in server-room style. Each building is a grid of 3x3 rooms with its server at the far end.
Corridors run along the top and bottom of both buildings and cross the street (the skybridge and the parking
underpass). The front doors open onto the street, where the parked cars and a concrete barrier are the only cover.

- **Steal the server:** grab the other team's server from their base and bring it to the glowing stand
  in yours. You can only score while your own server is at home. If the carrier is fired, the server drops;
  a teammate touching it sends it home (it also goes home by itself after 20 s). First to 3 captures, or
  the most after 15 minutes.
- **The lobby:** everyone starts on the character select screen and picks a team and a character. The
  host (the first player in the room, or you offline) sets **BOTS: ON / OFF** and presses **START MATCH**
  (Enter / B for bots, controller A / Y); everyone spawns together. After a match the scoreboard shows for
  a few seconds, then it's back to the lobby.
- **Bots** (when on) fill both teams up to four, and a bot leaves when a player joins mid-match. With bots
  off, only players fight. Without the server it's you, offline, with or without seven bots.
- **Pick a character** at the start and after every death:

  | Character | Role | Weapon | Q ability | Boss form (F) |
  |---|---|---|---|---|
  | Nikoloz | Tank, 250 HP | Fists; hold right click (or V) to block: 70% less damage from the front, half speed | Shoulder Charge: a tackle that carries enemies along; into a wall = slam + stun | **Steroid Nikoloz**: 600 HP, huge punches, blocks; Q = Ground Pound, a leap that slams everyone around |
  | Irakli | Assault | Shotgun | Double Espresso: faster for 5 s | **Grandmaster Irakli**: throws pawns, every 4th a rook; Q = Castling, swap places with a teammate |
  | Dimitri | Demolition | Fireballs (splash) | Fire Drill: sets the floor on fire | **Big Dimitri**: rockets |
  | Lasha | Flanker, fastest | Plasma | Chair Dash | **Lasha Hawking**: plasma that homes in, sees enemies through walls |
  | Sandro | Support | Pistol | Redistribution: heals teammates near him | **Communist Sandro**: hammer and sickle, heals the whole team |
  | M | Marksman | Rifle | Steady Aim: +50% damage for 6 s | **The Agamemnov**: spears, a fan of three every third throw |

- **The boss meter** fills as you deal damage, fire people, steal, return and capture servers, and heal
  (and slowly by itself). When it's full, **F** turns you into your boss form for 20 s.
- **Controls** as in the campaign, plus **Q** or right click = ability (Nikoloz blocks with right click / V / LB), **F** (or E) = boss form,
  **Tab** = scoreboard, **Esc** then **L** = leave the match. Controller: Y / RB ability, X boss form,
  hold View for the scoreboard. Touch: SKILL and BOSS buttons.

## Online co-op and Merge Conflict

When the online server (`server.js`) runs on the same computer as the website, the title screen
offers **PLAY ALONE**, **CO-OP** and **MERGE CONFLICT**, with how many people are in each right now.
Co-op and Merge Conflict are separate rooms of up to 8 players each.
Without the server, PLAY ALONE is the campaign as before and MERGE CONFLICT is you against bots.

### Running the server on the web server

1. Put `server.js` anywhere on the server, for example `/opt/officehell/server.js`. It needs
   Node.js 16 or newer (`node -v`) and nothing else.
2. Let players reach port 6363:

   ```
   sudo ufw allow 6363/tcp
   ```

   If your hosting panel has its own firewall, open TCP port 6363 there too.
3. Keep it running, even after a reboot, with systemd. Create
   `/etc/systemd/system/officehell.service`:

   ```
   [Unit]
   Description=63: Office Hell co-op server
   After=network.target

   [Service]
   ExecStart=/usr/bin/node /opt/officehell/server.js
   Restart=always

   [Install]
   WantedBy=multi-user.target
   ```

   then:

   ```
   sudo systemctl enable --now officehell
   journalctl -u officehell -f      # who joins and leaves
   ```
4. Upload the new `63_ Office Hell.html` to the website as before.

Check: http://31.97.38.206:6363/ should say `63: Office Hell co-op server, 0 playing, 0 in Merge Conflict`.

After updating `server.js`, restart it: `sudo systemctl restart officehell`. The new page needs the new
server (the old server doesn't know about the Merge Conflict room).

The page looks for the server at the address it was loaded from (`/ws`), then on port 6363 of that
computer. To use a server somewhere else, add `?server=<address>:<port>` to the page address. The site
is plain `http://`; if it ever moves to `https://`, have the web server pass `/ws` on to port 6363 so
the page gets `wss://` at its own address.

### Playing on a LAN instead

Put `server.js` next to the game file and run `node server.js`. Everyone on the network opens the
address it prints, like `http://192.168.0.113:6363/`. Keep that window open while you play.
Windows may ask to let Node through the firewall: allow it on private networks.

### Behind a Cloudflare tunnel

Run `server.js` next to the game file as on a LAN, and point the tunnel at it:

```
ingress:
  - hostname: game.example.com
    service: http://localhost:6363
  - service: http_status:404
```

`server.js` serves the page and the game's connection (`/ws`) on the same port, so both go through
the tunnel at `https://game.example.com/`. A tunnel only carries that one address: port 6363 of
`game.example.com` doesn't exist. If the tunnel points at another web server instead,
add a rule for the connection above the others (`path: ^/ws$`, `service: http://localhost:6363`).

### How co-op works

- The first player in is the host: their browser runs the coworkers, doors and pickups, and the
  others play in the host's world. If the host leaves, the next player takes over and the game goes on.
- Coworkers go for whoever is nearest.
- Friendly fire is on: your bullets, plasma and rockets hurt the other players, and rocket blasts
  hurt everyone near (you too) at 40%. The death screen says which player got you.
- Each player can pick up every gun once; ammo, health and armor are first come, first served.
- Killing a boss heals everyone.
- If you die, click to respawn at the front door with a pistol. The office stays as it is.
- Once the last boss is down, only the host can restart (`R`). A guest pressing `R` asks the host to restart.
- Pausing doesn't stop the game for the others, and your player stays in the office while you're paused.
- Up to 8 players. Another port: `PORT=7000 node server.js`. The page also needs `?server=<address>:7000`.

### How Merge Conflict works online

- The first player in is the host: their browser runs the bots, the servers, rockets, fire and pickups.
  If the host leaves, the next player takes over and the match goes on.
- Every player keeps their own health: whoever shoots decides what they hit and tells the others.
- No friendly fire in Merge Conflict.
- If the connection drops, the match goes on offline with bots.
