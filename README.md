# 63: Office Hell

Open `63_ Office Hell.html` in a browser to play alone. It's live at http://31.97.38.206/officehell/.

## Repository layout

```
63_ Office Hell.html   the game that ships -- one self-contained file, edited directly
server.js              optional co-op server (see below)
game/                  older modular source: index.html + js/*.js
assets/                PNG art the game is built from (chars, textures, props, weapons, items, fx)
tools/                 Python asset generators, the bundler, and deploy.sh
```

## Two codebases

Read this before editing anything.

`63_ Office Hell.html` is the real game. It started life as the output of `tools/bundle.py`,
but every change since -- Xbox controller and touch controls, the street NPCs, THE AGAMEMNOV,
online co-op, friendly fire -- was made **directly in that file**. It is the only version that
has those features, and it is what production serves.

`game/` is the modular source the file was originally bundled from, kept here for the art
pipeline and for reference. It is an ancestor: it has none of the features listed above.

So:

- **Changing the game?** Edit `63_ Office Hell.html`.
- **Do not run `tools/bundle.py` and ship its output.** It rebuilds from `game/` into
  `dist/63-office-hell.html` and would roll production back to the 28 Oct state.
- `tools/deploy.sh` uploads `63_ Office Hell.html`, which is correct. Keep it that way.

Folding the new features back into `game/` so there is one source again is worth doing, but
nobody has done it yet.

## Art pipeline

The scripts in `tools/` generate the PNGs in `assets/`: `heads.py` and `bodies.py` build the
crew sprites, `office_textures.py` the walls and floors, `fp_weapons.py` the first-person guns,
`make_items.py` the pickups. `build_characters.py` drives the character sheets and
`preview_office.py` renders a look at the level. They need Python with Pillow.

The full-resolution source photographs of the crew live in `assets/source/` and are **not**
committed -- this repo is public and the bundler never reads them. Get them from whoever
generated the sprites if you need to re-run the character scripts.

## Online co-op

When the co-op server (`server.js`) runs on the same computer as the website, the title screen
offers **PLAY ALONE** or **PLAY ONLINE**. It shows how many people are in the online game right now.
Without the server, the game is single player as before.

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
