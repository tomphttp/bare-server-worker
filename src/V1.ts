import type { RouteCallback } from './BareServer.js';
import type Server from './BareServer.js';
import { BareError, json } from './BareServer.js';
import { decodeProtocol } from './encodeProtocol.js';
import type { BareHeaders, BareRemote } from './requestUtil.js';
import { upgradeBareFetch } from './requestUtil.js';
import { bareFetch, randomHex } from './requestUtil.js';

const validProtocols: string[] = ['http:', 'https:', 'ws:', 'wss:'];

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

interface BareHeaderData {
	remote: BareRemote;
	headers: BareHeaders;
}

function readHeaders(request: Request): BareHeaderData {
	const remote: Partial<BareRemote> & { [key: string]: string | number } = {};
	const headers: BareHeaders = {};
	Reflect.setPrototypeOf(headers, null);

	for (const remoteProp of ['host', 'port', 'protocol', 'path']) {
		const header = `x-bare-${remoteProp}`;

		if (request.headers.has(header)) {
			const value = request.headers.get(header)!;

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

	if (request.headers.has('x-bare-headers')) {
		try {
			const json = JSON.parse(request.headers.get('x-bare-headers')!);

			for (const header in json) {
				if (typeof json[header] !== 'string' && !Array.isArray(json[header])) {
					throw new BareError(400, {
						code: 'INVALID_BARE_HEADER',
						id: `bare.headers.${header}`,
						message: `Header was not a String or Array.`,
					});
				}
			}

			Object.assign(headers, json);
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

	if (request.headers.has('x-bare-forward-headers')) {
		let json;

		try {
			json = JSON.parse(request.headers.get('x-bare-forward-headers')!);
		} catch (error) {
			throw new BareError(400, {
				code: 'INVALID_BARE_HEADER',
				id: `request.headers.x-bare-forward-headers`,
				message: `Header contained invalid JSON. (${
					error instanceof Error ? error.message : error
				})`,
			});
		}

		loadForwardedHeaders(json, headers, request);
	} else {
		throw new BareError(400, {
			code: 'MISSING_BARE_HEADER',
			id: `request.headers.x-bare-forward-headers`,
			message: `Header was not specified.`,
		});
	}

	return { remote: <BareRemote>remote, headers };
}

const tunnelRequest: RouteCallback = async (request) => {
	const { remote, headers } = readHeaders(request);

	const response = await bareFetch(request, request.signal, headers, remote);

	const responseHeaders = new Headers();

	for (const [header, value] of response.headers) {
		if (header === 'content-encoding' || header === 'x-content-encoding')
			responseHeaders.set('content-encoding', value);
		else if (header === 'content-length')
			responseHeaders.set('content-length', value);
	}

	responseHeaders.set(
		'x-bare-headers',
		JSON.stringify(response.headers.entries())
	);

	responseHeaders.set('x-bare-status', response.status.toString());
	responseHeaders.set('x-bare-status-text', response.statusText);

	return new Response(response.body, { status: 200, headers: responseHeaders });
};

const metaExpiration = 30e3;

const wsMeta: RouteCallback = async (request, options) => {
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

	// check if meta isn't undefined and if the version equals 1
	if (meta?.value.v !== 1)
		throw new BareError(400, {
			code: 'INVALID_BARE_HEADER',
			id: 'request.headers.x-bare-id',
			message: 'Unregistered ID',
		});

	await options.database.delete(id);

	return json(200, {
		headers: meta.value.response?.headers,
	});
};

const wsNewMeta: RouteCallback = async (request, options) => {
	const id = randomHex(16);

	await options.database.set(id, {
		value: { v: 1 },
		expires: Date.now() + metaExpiration,
	});

	return new Response(id);
};

const tunnelSocket: RouteCallback = async (request, options) => {
	const upgradeHeader = request.headers.get('upgrade');

	if (upgradeHeader !== 'websocket')
		throw new BareError(400, {
			code: 'INVALID_BARE_HEADER',
			id: `request.headers.upgrade`,
			message: `Expected websocket.`,
		});

	const [firstProtocol, data] =
		request.headers.get('sec-websocket-protocol')?.split(/,\s*/g) || [];

	if (firstProtocol !== 'bare')
		throw new BareError(400, {
			code: 'INVALID_BARE_HEADER',
			id: `request.headers.sec-websocket-protocol`,
			message: `Meta was not specified.`,
		});

	const {
		remote,
		headers,
		forward_headers: forwardHeaders,
		id,
	} = JSON.parse(decodeProtocol(data));

	loadForwardedHeaders(forwardHeaders, headers, request);

	const [client, server] = Object.values(new WebSocketPair());

	if (!id)
		throw new BareError(400, {
			code: 'INVALID_BARE_HEADER',
			id: `request.headers.sec-websocket-protocol`,
			message: `Expected ID.`,
		});

	const remoteSocket = await upgradeBareFetch(remote);

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

	const meta = await options.database.get(id);

	if (meta?.value.v === 1) {
		meta.value.response = {
			headers: {},
		};
		await options.database.set(id, meta);
	}

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

export default function registerV1(server: Server) {
	server.routes.set('/v1/', tunnelRequest);
	server.routes.set('/v1/ws-new-meta', wsNewMeta);
	server.routes.set('/v1/ws-meta', wsMeta);
	server.routes.set('/v1/', tunnelSocket);
}
