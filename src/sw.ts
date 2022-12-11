import KVAdapter from './KVAdapter.js';
import { cleanupDatabase } from './Meta.js';
import createBareServer from './createServer.js';

const kvDB = new KVAdapter(BARE);

const bare = createBareServer('/', {
	logErrors: true,
	database: kvDB,
});

addEventListener('fetch', (event) => {
	cleanupDatabase(kvDB);
	if (bare.shouldRoute(event.request))
		event.respondWith(bare.routeRequest(event.request));
});
