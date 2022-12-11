import type { JSONDatabaseAdapter } from './Meta.js';
import createHttpError from 'http-errors';

export interface BareErrorBody {
	code: string;
	id: string;
	message?: string;
	stack?: string;
}

export class BareError extends Error {
	status: number;
	body: BareErrorBody;
	constructor(status: number, body: BareErrorBody) {
		super(body.message || body.code);
		this.status = status;
		this.body = body;
	}
}

const project: BareProject = {
	name: 'bare-server-worker',
	description: 'TOMPHTTP Cloudflare Bare Server',
	repository: 'https://github.com/tomphttp/bare-server-worker',
	version: '1.2.2',
};

export function json<T>(status: number, json: T) {
	return new Response(JSON.stringify(json, null, '\t'), {
		status,
		headers: {
			'content-type': 'application/json',
		},
	});
}

export type BareMaintainer = {
	email?: string;
	website?: string;
};

export type BareProject = {
	name?: string;
	description?: string;
	email?: string;
	website?: string;
	repository?: string;
	version?: string;
};

export type BareLanguage =
	| 'NodeJS'
	| 'ServiceWorker'
	| 'Deno'
	| 'Java'
	| 'PHP'
	| 'Rust'
	| 'C'
	| 'C++'
	| 'C#'
	| 'Ruby'
	| 'Go'
	| 'Crystal'
	| 'Shell'
	| string;

export type BareManifest = {
	maintainer?: BareMaintainer;
	project?: BareProject;
	versions: string[];
	language: BareLanguage;
	memoryUsage?: number;
};

export interface Options {
	logErrors: boolean;
	localAddress?: string;
	maintainer?: BareMaintainer;
	database: JSONDatabaseAdapter;
}

export type RouteCallback = (
	request: Request,
	options: Options
) => Promise<Response> | Response;

export default class Server extends EventTarget {
	routes = new Map<string, RouteCallback>();
	socketRoutes = new Map<string, RouteCallback>();
	private closed = false;
	private directory: string;
	private options: Options;
	/**
	 * @internal
	 */
	constructor(directory: string, options: Options) {
		super();
		this.directory = directory;
		this.options = options;
	}
	/**
	 * Remove all timers and listeners
	 */
	close() {
		this.closed = true;
		this.dispatchEvent(new Event('close'));
	}
	shouldRoute(request: Request): boolean {
		return (
			!this.closed && new URL(request.url).pathname.startsWith(this.directory)
		);
	}
	get instanceInfo(): BareManifest {
		return {
			versions: ['v1', 'v2'],
			language: 'Cloudflare',
			maintainer: this.options.maintainer,
			project,
		};
	}
	async routeRequest(request: Request) {
		const service = new URL(request.url).pathname.slice(
			this.directory.length - 1
		);
		let response: Response;

		const isSocket = request.headers.get('upgrade') === 'websocket';

		try {
			if (request.method === 'OPTIONS') {
				response = new Response(undefined, { status: 200 });
			} else if (service === '/') {
				response = json(200, this.instanceInfo);
			} else if (!isSocket && this.routes.has(service)) {
				const call = this.routes.get(service)!;
				response = await call(request, this.options);
			} else if (isSocket && this.socketRoutes.has(service)) {
				const call = this.socketRoutes.get(service)!;
				response = await call(request, this.options);
			} else {
				throw new createHttpError.NotFound();
			}
		} catch (error) {
			if (this.options.logErrors) console.error(error);

			if (createHttpError.isHttpError(error)) {
				response = json(error.statusCode, {
					code: 'UNKNOWN',
					id: `error.${error.name}`,
					message: error.message,
					stack: error.stack,
				});
			} else if (error instanceof Error) {
				response = json(500, {
					code: 'UNKNOWN',
					id: `error.${error.name}`,
					message: error.message,
					stack: error.stack,
				});
			} else {
				response = json(500, {
					code: 'UNKNOWN',
					id: 'error.Exception',
					message: error,
					stack: new Error(<string | undefined>error).stack,
				});
			}

			if (!(response instanceof Response)) {
				if (this.options.logErrors) {
					console.error(
						'Cannot',
						request.method,
						new URL(request.url).pathname,
						': Route did not return a response.'
					);
				}

				throw new createHttpError.InternalServerError();
			}
		}

		response.headers.set('x-robots-tag', 'noindex');
		response.headers.set('access-control-allow-headers', '*');
		response.headers.set('access-control-allow-origin', '*');
		response.headers.set('access-control-allow-methods', '*');
		response.headers.set('access-control-expose-headers', '*');
		// don't fetch preflight on every request...
		// instead, fetch preflight every 10 minutes
		response.headers.set('access-control-max-age', '7200');

		return response;
	}
}
