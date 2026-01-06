import { GameServer } from './net/Server.js';

const PORT = 3000;
const server = new GameServer(PORT);
server.start();
