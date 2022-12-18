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
	return await fetch(
		`${remote.protocol}//${remote.host}:${remote.port}${remote.path}`,
		{
			headers: requestHeaders as HeadersInit,
			method: request.method,
			body: noBody.includes(request.method) ? undefined : await request.blob(),
			signal,
			redirect: 'manual',
		}
	);
}

export async function upgradeBareFetch(
	request: Request,
	signal: AbortSignal,
	requestHeaders: BareHeaders,
	remote: BareRemote
) {
	const res = await fetch(
		`${remote.protocol}//${remote.host}:${remote.port}${remote.path}`,
		{
			headers: requestHeaders as HeadersInit,
			method: request.method,
			signal,
		}
	);

	if (!res.webSocket) throw new Error("server didn't accept WebSocket");

	return [res, res.webSocket] as [Response, WebSocket];
}
