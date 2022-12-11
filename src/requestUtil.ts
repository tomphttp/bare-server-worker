import type { Options } from './BareServer';
import type CommonMeta from './Meta';

export interface BareRemote {
	host: string;
	port: number | string;
	path: string;
	protocol: string;
}

export type BareHeaders = Record<string, string | string[]>;

export function randomHex(byteLength: number) {
	const bytes = new Uint8Array(byteLength);
	crypto.getRandomValues(bytes);
	let hex = '';
	for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
	return hex;
}

const noBody = ['GET', 'HEAD'];

export async function bareFetch(
	request: Request,
	signal: AbortSignal,
	requestHeaders: BareHeaders,
	remote: BareRemote
) {
	return await globalThis.fetch(
		`${remote.protocol}//${remote.host}:${remote.port}${remote.path}`,
		{
			headers: requestHeaders as HeadersInit,
			body: noBody.includes(request.method) ? undefined : await request.blob(),
			signal,
			redirect: 'manual',
		}
	);
}

export function upgradeBareFetch(remote: BareRemote) {
	return new Promise<WebSocket>((resolve, reject) => {
		const cleanup = () => {
			ws.removeEventListener('error', onError);
			ws.removeEventListener('open', onOpen);
		};

		const onError = () => {
			cleanup();
			reject();
		};

		const onOpen = () => {
			cleanup();
			resolve(ws);
		};

		const ws = new WebSocket(
			`${remote.protocol}//${remote.host}:${remote.port}${remote.path}`
		);

		ws.addEventListener('error', onError);
		ws.addEventListener('open', onOpen);
	});
}
