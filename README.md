# Agar.io Clone

I tried vibecoding a clone of [Agar.io](https://agar.io/) as accurately as possible in terms of design, gameplay and mechanics. Players control a cell, consume food, and compete against others to grow larger and dominate the arena.
I've intentinally left out authentication, leaderboard, and monetization features to prioritize the core gameplay and faithfully replicate the original design.

Link to the clone I made: [Agar.io clone](https://agar.wtf/)

## Why?

I was bored and wanted to practice real-time multiplayer game development for the web using TypeScript. 
**_I don't intend to monetize or compete with the original game; this is purely for learning purposes._**

## Demo

![Gameplay Demo](client/public/demo/gameplay.gif)

## Features
- Multiplayer gameplay with real-time networking
- Custom skins and visual effects
- Bot players for single-player experience
- Modular codebase (client, server, shared)

## Project Structure


This project is organized into three main parts:

- **Client:** Web-based frontend (TypeScript, HTML, CSS). Handles rendering, user input, and real-time communication with the server.
- **Server:** Node.js backend. Manages the game world, player/bot states, and core gameplay logic for multiplayer.
- **Shared:** Common types, protocol definitions, and logic used by both client and server to keep communication and game rules consistent.

The modular design ensures a clear separation of concerns:
- The client focuses on user experience, visuals, and input.
- The server handles authoritative game state, simulation, and networking.
- The shared code prevents duplication and keeps both sides in sync regarding game rules and data structures.

This architecture makes the codebase easier to maintain, extend, and reason about, while also supporting both multiplayer and single-player (bot) gameplay.

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- pnpm (package manager)

### Installation
1. Clone the repository:
   ```sh
   git clone https://github.com/yourusername/agar-clone.git
   cd agar-clone
   ```
2. Install dependencies:
   ```sh
   pnpm install
   ```

### Running the Game
1. Start the server:
   ```sh
   pnpm --filter server run start
   ```
2. Start the client (development mode):
   ```sh
   pnpm --filter client run dev
   ```
3. Open your browser and navigate to the client URL (usually `http://localhost:3000`).

## Scripts
- `pnpm --filter client run dev` — Start client in development mode
- `pnpm --filter server run start` — Start server

## Contributing
Pull requests are welcome! Please open issues for suggestions or bugs.

## License
MIT License
