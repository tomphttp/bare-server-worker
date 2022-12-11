import type { RouteCallback } from './BareServer.js';
import { BareError } from './BareServer.js';
import type Server from './BareServer.js';
import type { BareHeaders, BareRemote } from './requestUtil.js';
import { upgradeBareFetch } from './requestUtil.js';
import { bareFetch, randomHex } from './requestUtil.js';
import { joinHeaders, splitHeaders } from './splitHeaderUtil.js';

const validProtocols: string[] = ['http:', 'https:', 'ws:', 'wss:'];

const forbiddenForwardHeaders: string[] = [
	'connection',
	'transfer-encoding',
	'host',
	'connection',
	'origin',
	'referer',
];

const forbiddenPassHeaders: string[] = [
	'vary',
	'connection',
	'transfer-encoding',
	'access-control-allow-headers',
	'access-control-allow-methods',
	'access-control-expose-headers',
	'access-control-max-age',
	'access-control-request-headers',
	'access-control-request-method',
];

// common defaults
const defaultForwardHeaders: string[] = [
	'accept-encoding',
	'accept-language',
	'sec-websocket-extensions',
	'sec-websocket-key',
	'sec-websocket-version',
];

const defaultPassHeaders: string[] = [
	'content-encoding',
	'content-length',
	'last-modified',
];

// defaults if the client provides a cache key
const defaultCacheForwardHeaders: string[] = [
	'if-modified-since',
	'if-none-match',
	'cache-control',
];

const defaultCachePassHeaders: string[] = ['cache-control', 'etag'];

const cacheNotModified = 304;

function loadForwardedHeaders(
	forward: string[],
	target: BareHeaders,
	request: Request
) {
	for (const header of forward) {
		if (request.headers.has(header)) {
			target[header] = request.headers.get(header)!;
		}
	}
}

const splitHeaderValue = /,\s*/g;

interface BareHeaderData {
	remote: BareRemote;
	sendHeaders: BareHeaders;
	passHeaders: string[];
	passStatus: number[];
	forwardHeaders: string[];
}

function readHeaders(request: Request): BareHeaderData {
	const remote = Object.setPrototypeOf({}, null);
	const sendHeaders = Object.setPrototypeOf({}, null);
	const passHeaders = [...defaultPassHeaders];
	const passStatus = [];
	const forwardHeaders = [...defaultForwardHeaders];

	// should be unique
	const cache = new URL(request.url).searchParams.has('cache');

	if (cache) {
		passHeaders.push(...defaultCachePassHeaders);
		passStatus.push(cacheNotModified);
		forwardHeaders.push(...defaultCacheForwardHeaders);
	}

	const headers = joinHeaders(request.headers);

	for (const remoteProp of ['host', 'port', 'protocol', 'path']) {
		const header = `x-bare-${remoteProp}`;

		if (headers.has(header)) {
			const value = headers.get(header)!;

			switch (remoteProp) {
				case 'port':
					if (isNaN(parseInt(value))) {
						throw new BareError(400, {
							code: 'INVALID_BARE_HEADER',
							id: `request.headers.${header}`,
							message: `Header was not a valid integer.`,
						});
					}
					break;
				case 'protocol':
					if (!validProtocols.includes(value)) {
						throw new BareError(400, {
							code: 'INVALID_BARE_HEADER',
							id: `request.headers.${header}`,
							message: `Header was invalid`,
						});
					}
					break;
			}

			remote[remoteProp] = value;
		} else {
			throw new BareError(400, {
				code: 'MISSING_BARE_HEADER',
				id: `request.headers.${header}`,
				message: `Header was not specified.`,
			});
		}
	}

	if (headers.has('x-bare-headers')) {
		try {
			const json = JSON.parse(headers.get('x-bare-headers')!);

			for (const header in json) {
				const value = json[header];

				if (typeof value === 'string') {
					sendHeaders[header] = value;
				} else if (Array.isArray(value)) {
					const array = [];

					for (const val in value) {
						if (typeof val !== 'string') {
							throw new BareError(400, {
								code: 'INVALID_BARE_HEADER',
								id: `bare.headers.${header}`,
								message: `Header was not a String.`,
							});
						}

						array.push(val);
					}

					sendHeaders[header] = array;
				} else {
					throw new BareError(400, {
						code: 'INVALID_BARE_HEADER',
						id: `bare.headers.${header}`,
						message: `Header was not a String.`,
					});
				}
			}
		} catch (error) {
			if (error instanceof SyntaxError) {
				throw new BareError(400, {
					code: 'INVALID_BARE_HEADER',
					id: `request.headers.x-bare-headers`,
					message: `Header contained invalid JSON. (${error.message})`,
				});
			} else {
				throw error;
			}
		}
	} else {
		throw new BareError(400, {
			code: 'MISSING_BARE_HEADER',
			id: `request.headers.x-bare-headers`,
			message: `Header was not specified.`,
		});
	}

	if (headers.has('x-bare-pass-status')) {
		const parsed = headers.get('x-bare-pass-status')!.split(splitHeaderValue);

		for (const value of parsed) {
			const number = parseInt(value);

			if (isNaN(number)) {
				throw new BareError(400, {
					code: 'INVALID_BARE_HEADER',
					id: `request.headers.x-bare-pass-status`,
					message: `Array contained non-number value.`,
				});
			} else {
				passStatus.push(number);
			}
		}
	}

	if (headers.has('x-bare-pass-headers')) {
		const parsed = headers.get('x-bare-pass-headers')!.split(splitHeaderValue);

		for (let header of parsed) {
			header = header.toLowerCase();

			if (forbiddenPassHeaders.includes(header)) {
				throw new BareError(400, {
					code: 'FORBIDDEN_BARE_HEADER',
					id: `request.headers.x-bare-forward-headers`,
					message: `A forbidden header was passed.`,
				});
			} else {
				passHeaders.push(header);
			}
		}
	}

	if (headers.has('x-bare-forward-headers')) {
		const parsed = headers
			.get('x-bare-forward-headers')!
			.split(splitHeaderValue);

		for (let header of parsed) {
			header = header.toLowerCase();

			if (forbiddenForwardHeaders.includes(header)) {
				throw new BareError(400, {
					code: 'FORBIDDEN_BARE_HEADER',
					id: `request.headers.x-bare-forward-headers`,
					message: `A forbidden header was forwarded.`,
				});
			} else {
				forwardHeaders.push(header);
			}
		}
	}

	return {
		remote,
		sendHeaders,
		passHeaders,
		passStatus,
		forwardHeaders,
	};
}

const tunnelRequest: RouteCallback = async (request) => {
	const { remote, sendHeaders, passHeaders, passStatus, forwardHeaders } =
		readHeaders(request);

	loadForwardedHeaders(forwardHeaders, sendHeaders, request);

	const response = await bareFetch(
		request,
		request.signal,
		sendHeaders,
		remote
	);

	const responseHeaders = new Headers();

	for (const [header, value] of passHeaders) {
		if (!response.headers.has(header)) continue;
		responseHeaders.set(header, value);
	}

	const status = passStatus.includes(response.status) ? response.status : 200;

	if (status !== cacheNotModified) {
		responseHeaders.set('x-bare-status', response.status.toString());
		responseHeaders.set('x-bare-status-text', response.statusText);
		responseHeaders.set(
			'x-bare-headers',
			JSON.stringify(Object.fromEntries(response.headers))
		);
	}

	return new Response(response.body, {
		status,
		headers: splitHeaders(responseHeaders),
	});
};

const metaExpiration = 30e3;

const getMeta: RouteCallback = async (request, options) => {
	if (request.method === 'OPTIONS') {
		return new Response(undefined, { status: 200 });
	}

	if (!request.headers.has('x-bare-id')) {
		throw new BareError(400, {
			code: 'MISSING_BARE_HEADER',
			id: 'request.headers.x-bare-id',
			message: 'Header was not specified',
		});
	}

	const id = request.headers.get('x-bare-id')!;
	const meta = await options.database.get(id);

	if (meta?.value.v !== 2)
		throw new BareError(400, {
			code: 'INVALID_BARE_HEADER',
			id: 'request.headers.x-bare-id',
			message: 'Unregistered ID',
		});

	if (!meta.value.response)
		throw new BareError(400, {
			code: 'INVALID_BARE_HEADER',
			id: 'request.headers.x-bare-id',
			message: 'Meta not ready',
		});

	await options.database.delete(id);

	const responseHeaders = new Headers();

	responseHeaders.set('x-bare-status', meta.value.response.status.toString());
	responseHeaders.set('x-bare-status-text', meta.value.response.statusText);
	responseHeaders.set(
		'x-bare-headers',
		JSON.stringify(meta.value.response.headers)
	);

	return new Response(undefined, {
		status: 200,
		headers: splitHeaders(responseHeaders),
	});
};

const newMeta: RouteCallback = async (request, options) => {
	const { remote, sendHeaders, forwardHeaders } = readHeaders(request);

	const id = randomHex(16);

	await options.database.set(id, {
		expires: Date.now() + metaExpiration,
		value: {
			v: 2,
			remote,
			sendHeaders,
			forwardHeaders,
		},
	});

	return new Response(id);
};

const tunnelSocket: RouteCallback = async (request, options) => {
	const id = request.headers.get('sec-websocket-protocol');

	if (!id)
		throw new BareError(400, {
			code: 'INVALID_BARE_HEADER',
			id: `request.headers.sec-websocket-protocol`,
			message: `Expected ID.`,
		});

	const meta = await options.database.get(id);

	if (meta?.value.v !== 2)
		throw new BareError(400, {
			code: 'INVALID_BARE_HEADER',
			id: `request.headers.sec-websocket-protocol`,
			message: `Bad ID.`,
		});

	loadForwardedHeaders(
		meta.value.forwardHeaders,
		meta.value.sendHeaders,
		request
	);

	const [client, server] = Object.values(new WebSocketPair());

	const remoteSocket = await upgradeBareFetch(meta.value.remote);

	server.accept();

	remoteSocket.addEventListener('close', () => {
		server.close();
	});

	server.addEventListener('close', () => {
		remoteSocket.close();
	});

	remoteSocket.addEventListener('error', (error) => {
		if (options.logErrors) {
			console.error('Remote socket error:', error);
		}

		server.close();
	});

	remoteSocket.addEventListener('error', (error) => {
		if (options.logErrors) {
			console.error('Serving socket error:', error);
		}

		remoteSocket.close();
	});

	meta.value.response = {
		headers: {},
		status: 101,
		statusText: 'Continue',
	};

	await options.database.set(id, meta);

	// pipe

	remoteSocket.addEventListener('message', (message) => {
		server.send(message.data);
	});

	server.addEventListener('message', (message) => {
		remoteSocket.send(message.data);
	});

	return new Response(undefined, {
		status: 101,
		webSocket: client,
	});
};

export default function registerV2(server: Server) {
	server.routes.set('/v2/', tunnelRequest);
	server.routes.set('/v2/ws-new-meta', newMeta);
	server.routes.set('/v2/ws-meta', getMeta);
	server.socketRoutes.set('/v2/', tunnelSocket);
}
