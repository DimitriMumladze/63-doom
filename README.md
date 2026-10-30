# 63: Office Hell

Open `63_ Office Hell.html` in a browser to play alone. It's live at http://31.97.38.206/officehell/.

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
- Coworkers go for whoever is nearest. No friendly fire.
- Each player can pick up every gun once; ammo, health and armor are first come, first served.
- Killing a boss heals everyone.
- If you die, click to respawn at the front door with a pistol. The office stays as it is.
- Once the last boss is down, only the host can restart (`R`). A guest pressing `R` asks the host to restart.
- Pausing doesn't stop the game for the others, and your player stays in the office while you're paused.
- Up to 8 players. Another port: `PORT=7000 node server.js`. The page also needs `?server=<address>:7000`.
