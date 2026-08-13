# Volt Kart

A cartoon arcade kart racer you can play in the browser. Original game — no Nintendo characters, names, or music. Drift the sunset island circuit, snag items, and beat five AI racers over three laps.

Static site only: HTML, CSS, and ES modules. Three.js is loaded from a CDN via an import map. No build step, no backend.

## How to run

From this folder:

```bash
python3 -m http.server 8080
```

Then open [http://localhost:8080](http://localhost:8080).

Any static file server works (VS Code Live Server, `npx serve`, GitHub Pages, etc.). Opening `index.html` as a `file://` URL will not load ES modules.

## Controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Accelerate | `W` / `↑` | **GAS** |
| Brake / reverse | `S` / `↓` | **BRAKE** |
| Steer | `A` `D` / `←` `→` | **◀ ▶** |
| Hop / drift | `Space` / `Shift` | **DRIFT** |
| Use item | `E` / `Ctrl` | **ITEM** |
| Mute | `M` | speaker button |

Hold **Drift** into a turn to slide. Stay in the drift to charge a mini-turbo (orange, then blue sparks). Release for a speed burst. Drive over the teal chevrons for boost pads.

## Items

Question-mark boxes on the racing line grant one item at a time:

- **Boost** — mushroom-style speed burst
- **Banana** — drop a peel behind you
- **Shell** — red homing shot at the racer ahead

## Racers

You are **Volt** (teal). AI field: Ember, Reef, Sunny, Orchid, Bolt.

## Known limitations

- No gamepad / analog stick; digital keyboard and on-screen buttons only
- Single circuit (Sunset Island)
- Synthesized Web Audio only — engines, beeps, whooshes, no streamed music
- Best in a current Chromium, Firefox, or Safari. Import maps required
- Shadow quality is capped for laptops and mid-range phones

## Play
https://windfaller.github.io/arcade-kart/
