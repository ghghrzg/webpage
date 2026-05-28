# Traffic Light Crossing

A traffic management game where you control traffic lights at a busy intersection to prevent car crashes.

## Gameplay

- **Control Traffic Lights**: Manage red, yellow, and green lights for 4 roads
- **Prevent Crashes**: Avoid collisions by timing lights correctly
- **Score Points**: Each vehicle that passes safely increases your score
- **Game Duration**: 60 seconds of intense traffic control action

## Road Layout

```
          North (1 lane)
             ↓ ↑
  West →  [INTERSECTION]  ← East
  (2 lanes) ↑ ↓  (2 lanes)
         South (1 lane)
```

- **North & South**: Single lane (straight only)
- **East & West**: Two lanes (one straight, one left turn)

## Scoring

- **Safe Pass**: +15 points per vehicle
- **Crashed**: -1 life (3 lives total)

## Features

- Responsive traffic light timing
- Sound effects (can be muted)
- Game pause/resume
- Score tracking

## Development

```bash
npm install
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
```

The game runs on port 3001 during development.
