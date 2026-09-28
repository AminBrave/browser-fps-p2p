import { PeerServer } from 'peer';

const PORT = Number(process.env.PORT || 9000);
const PATH = String(process.env.PEER_SERVER_PATH || '/').trim() || '/';

const server = PeerServer({
  port: PORT,
  path: PATH,
  proxied: true,
  allow_discovery: false,
});

server.on('connection', (client) => {
  console.info('[PeerServer] connected', client.getId());
});

server.on('disconnect', (client) => {
  console.info('[PeerServer] disconnected', client.getId());
});

server.on('error', (error) => {
  console.error('[PeerServer] error', error);
});

console.info(`[PeerServer] listening on port ${PORT}, path ${PATH}`);
