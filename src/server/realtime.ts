import type { FastifyInstance } from 'fastify';
import { Server } from 'socket.io';

const LOCAL_HOSTS = new Set(['127.0.0.1', '::1', 'localhost']);

function getHostname(hostHeader: string | undefined): string {
  if (!hostHeader) {
    return '';
  }
  if (hostHeader.startsWith('[')) {
    return hostHeader.slice(1, hostHeader.indexOf(']'));
  }
  return hostHeader.split(':')[0] ?? '';
}

export function attachRealtime(app: FastifyInstance): void {
  const io = new Server(app.server, {
    path: '/api/socket.io',
    serveClient: false,
    transports: ['websocket'],
    allowRequest(request, callback) {
      callback(null, LOCAL_HOSTS.has(getHostname(request.headers.host)));
    },
  });

  io.on('connection', (socket) => {
    socket.emit('on_server_version', { major: 0, minor: 1, patch: 0, prerelease: null });
  });

  app.addHook('onClose', async () => {
    await new Promise<void>((resolve) => io.close(() => resolve()));
  });
}
