# Marisol Bay

[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/ixciamakima/marisol-bay/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/ixciamakima/marisol-bay/reward.svg)](https://make.fun/bounty/gta6-01)

An original open-world crime game for the [make.fun "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).
Explore the sun-soaked coastal city of Marisol Bay on foot and by car: steal cars, outrun the
Marisol Bay Police, run jobs for fixer Vera Solano, and take the city back — one job at a time.

## Play

Serve `game/` with any static file server and open `game/index.html` in desktop Chrome.
No build step, no network request — every file the game loads lives under `game/`.

```sh
cd game && python3 -m http.server 8080
# open http://localhost:8080
```

## The game

- **A city to explore** — a 520×520 m grid of streets, Plaza del Sol, Solmarina Beach, the marina docks, and the Solmarina Tower, all generated from a seed.
- **On foot and by car** — walk, sprint, punch, shoot (after Mission 5), jack any car on the street, and drive with arcade handling, handbrake and horn.
- **Traffic and pedestrians** — cars that drive the grid and turn at intersections, crowds on the sidewalks that flee gunfire, and taxi customers who wave you down.
- **Wanted level** — 5 stars of heat. Police cruisers chase and ram you; foot cops chase you down and bust you if they catch you. Lay low and the heat cools off.
- **Missions and story** — 6 story jobs for Vera Solano (meet, taxi fare, car theft, surviving the heat, a dockside shootout, a getaway), plus repeatable taxi fares. Cash and respect are saved in your browser.
- **HUD and minimap** — cash, wanted stars, health, objective banner, speed, and a live minimap with mission markers, police and traffic.
- **Sound and music** — fully synthesized WebAudio: a synthwave loop, engine hum, sirens, gunshots and crashes. No audio files.
- **Polish** — golden-hour lighting, shadows, particles, screen feedback, pause and game-over flows, start screen and savegames.

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move / drive |
| Shift | Sprint / handbrake |
| E | Enter / exit car |
| F | Punch |
| Mouse click | Fire pistol |
| C | Camera distance |
| H | Horn |
| M | Mute |
| Esc | Pause |

## Originality

Marisol Bay is 100% original: its city, characters (Leo Marchetti, Vera Solano), vehicles
(Comet GT, Vulcaro Coupe, Strada Sedan), story, art and music were made for this entry.
Nothing from Rockstar Games' Grand Theft Auto series or any other commercial game appears in it.

## Tech

- [three.js](https://threejs.org/) r160, vendored as `game/vendor/three.module.min.js`
- Plain ES modules under `game/js/`, one file per job: city, vehicles, pedestrians, player, missions, HUD, effects, audio
- Entry program `main.ts` copies `game/` + `screenshots/` to `/output` and writes `dossier.json` via `vendor/makefun-game.ts`

## License

MIT — see [LICENSE](LICENSE).
