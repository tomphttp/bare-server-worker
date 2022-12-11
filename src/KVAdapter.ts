import type { Database } from './Meta';

export default class KVAdapter implements Database {
	private ns: KVNamespace;
	constructor(ns: KVNamespace) {
		this.ns = ns;
	}
	async get(key: string) {
		return (await this.ns.get(key)) as string;
	}
	async set(key: string, value: string) {
		await this.ns.put(key, value);
	}
	async has(key: string) {
		return (await this.ns.list()).keys.some((e) => e.name === key);
	}
	async delete(key: string) {
		await this.ns.delete(key);
		return true;
	}
	async entries() {
		const entries: [string, string][] = [];

		for (const { name } of (await this.ns.list()).keys)
			entries.push([name, await this.get(name)]);

		return entries[Symbol.iterator]();
	}
}
