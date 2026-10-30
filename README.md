# 63: Office Hell

Open `63_ Office Hell.html` in a browser to play alone. It's live at http://31.97.38.206/officehell/.

## Repository layout

```
63_ Office Hell.html   the game: one self-contained file, built by tools/bundle.py
server.js              optional server: co-op relay + battle royale referee (see below)
game/                  the source -- index.html + js/*.js
  js/collide.js          level geometry, shared with server.js
  js/weapons.js          the guns, shared with server.js
  js/maps/               level data: office.js (campaign), block.js + yard.js (battle royale)
  js/mode.js             the two sets of rules, behind Game.mode
assets/                art, music and the Georgian pixel font, embedded at build time
tools/                 asset generators, bundle.py, unbundle.py, deploy.sh, the tests
```

There are two games in here. The campaign is the office gone wrong, alone or in co-op.
The battle royale is up to fifteen people in the yard with a closing ring; see below.

## Building

`63_ Office Hell.html` is generated. Edit the source in `game/`, then:

```
py tools/bundle.py
```

That inlines `game/js/*.js` and embeds everything under `assets/` as data URIs, so the
result opens straight from disk with no server and no loose files. The build is
deterministic -- same source in, byte-identical file out -- so a rebuild with no source
changes leaves git clean. `bash tools/deploy.sh` rebuilds and uploads in one step.

The one exception is the boss music. The two tracks are 5.3 MB of the 7.5 MB of art, and
embedding them made a 10 MB page out of a 3 MB one for two songs most players never reach,
so they are *linked* instead (`LINKED` in `tools/bundle.py`) and loaded from `assets/music/`
next to the page. `deploy.sh` uploads them with it. Opened straight from disk the game plays
exactly as before except that those two songs are silent.

Unbundled, `game/index.html` runs too: it loads the same assets from `../assets/` instead
of from `window.EMBED`. Handy for debugging, since you get real filenames and line numbers.

### If someone edits the built file directly

For a stretch in late October the single HTML *was* the only copy, and co-op, the bosses,
the street NPCs, gamepad and touch support were all written straight into it. That is undone:
`tools/unbundle.py` splits a built file back into `game/` and `assets/`, and was used to
recover exactly that work. If the shipped file ever runs ahead again:

```
py tools/unbundle.py            # or: py tools/unbundle.py some-other-build.html
```

Then rebuild and confirm you get the same file back.

## Tests

None of them need a browser, and all of them are plain `node`:

```
node tools/smoke.js        plays the campaign for a simulated minute
node tools/drawtest.js     draws every screen once against a recording canvas
node tools/checkmap.js [block|yard|office] [--ascii]   checks a map spec
node tools/checkoffice.js  the office inside the block is still the office
node tools/botclient.js 15                        fills a match with bots
node tools/headless.js 8                          plays a match with real clients
```

`smoke.js` and `drawtest.js` are the regression tests: between them they run the real
engine, level, mode, game, net and hud modules, so a rename or a missing asset key turns
up there instead of as a black screen.

The two match tests need `node server.js` running. `botclient.js` tests the server by
speaking its protocol; `headless.js` tests the client by *being* one -- it loads the
actual client modules and plays through the lobby, the drop, firing, the ring, dying,
spectating and the scoreboard.

## Art pipeline

The scripts in `tools/` generate the PNGs in `assets/`: `heads.py` and `bodies.py` build the
crew sprites, `office_textures.py` the walls and floors, `fp_weapons.py` the first-person guns,
`make_items.py` the pickups. `build_characters.py` drives the character sheets and
`preview_office.py` renders a look at the level. They need Python with Pillow.

The full-resolution source photographs of the crew live in `assets/source/` and are **not**
committed -- this repo is public and the bundler never reads them. Get them from whoever
generated the sprites if you need to re-run the character scripts.

## Online

When `server.js` runs on the same computer as the website, the title screen offers
**PLAY ALONE**, **PLAY ONLINE** (co-op) and **BATTLE ROYALE**, and shows how many people
are in each right now. Without the server, the game is single player as before.

The two are different arrangements, because they want different things:

- **co-op** is peer to peer through a relay. The first player in is the host and runs the
  world in their browser; the server only passes messages on. Up to 8.
- **battle royale** is server-authoritative. The server owns who is alive, who shot whom,
  where the ring is and who won. Up to 15.

### Running the server on the web server

`bash tools/deploy.sh --server` does the uploading part of this.

1. Put `server.js` anywhere on the server, for example `/opt/officehell/server.js`. It needs
   Node.js 16 or newer (`node -v`) and nothing else.

   For the battle royale it also needs the rules it shares with the game, in the same layout
   next to it: `game/js/collide.js`, `game/js/weapons.js` and `game/js/maps/yard.js`. There is
   one copy of "is that solid" and "how fast does a shotgun fire", and both sides read it.
   Without those three files the server starts anyway, says so, and offers co-op only.
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

Check: http://31.97.38.206:6363/ should say `63: Office Hell co-op server, 0 playing`.

The page looks for the server on port 6363 of the computer it was loaded from. To use a server
somewhere else, add `?server=<address>:<port>` to the page address. The site is plain `http://`;
if it ever moves to `https://`, put the co-op server behind the web server so it gets `wss://`.

### Playing on a LAN instead

Put `server.js` next to the game file and run `node server.js`. Everyone on the network opens the
address it prints, like `http://192.168.0.113:6363/`. Keep that window open while you play.
Windows may ask to let Node through the firewall: allow it on private networks.

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

### How the battle royale works

- **The lobby.** Pick which colleague you are -- there are nine, and the server hands out the
  spare ones first so two people are not the same person while there is a choice -- and ready
  up. The match starts once everyone is ready, or after a minute and a half regardless. Two
  people minimum, fifteen maximum. Turn up mid-match and you watch until the next one.
- **The drop.** No parachute: there is one floor in a raycaster. The lift doors open on a
  spawn point chosen to be as far from everybody else as the map allows, and you cannot move
  or be shot for the first two and a half seconds.
- **The ring** is the building's fire-suppression system venting the yard a section at a time.
  Seven phases, each sitting still and then closing on a new circle drawn inside the old one.
  Outside it you lose 1 health a second at first and 18 by the end, and body armour is no help
  against gas. It shows up as a curtain of drifting static, and on the minimap as two circles:
  where it is, and where it is going.
- **Shooting.** Your browser works out what you hit, because it has the geometry and the pellet
  spread. The server rolls the damage, and throws the shot away if the gun fired faster than it
  can, if the range is too far, or if there was a wall in the way. It rewinds everyone half a
  round trip, so shooting at where you saw someone hits.
- **Dying** is final -- no respawn. You get your placing, and then watch whoever is still
  standing until the match ends. The last one left is employee of the month.
- Everyone starts with the same shotgun for now; loot is the next thing.

### The map

`maps/block.js`, 96 x 96 -- four times the office across and about five times its
walkable area. Eight places worth going, strung along one street: the **63 office**
itself (the campaign's own rows, stamped in, so the building you fight through is the
building you work in), the **car park**, the **roof**, the **warehouse** with its
mezzanine, the **kiosks** along the road, the **underpass**, the **loading yard** and
the **alleys** between them.

Two things the engine decides for us. There is one floor plane and no sectors, so the
roof and the underpass are not above or below anything -- they are flat places dressed
to read that way, open sky behind a parapet for one and a low dark tiled ceiling for
the other. And the office's doors are opened: a sliding door is the one piece of
geometry the server would have to arbitrate every frame, and a battle royale has no
use for it.

`MAP=yard node server.js` plays `maps/yard.js` instead, which is the small map the
netcode was built against. A match on it takes a minute rather than four.
