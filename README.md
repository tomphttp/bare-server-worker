# TOMP Bare Server

This repository implements the TompHTTP bare server. See the specification [here](https://github.com/tomphttp/specifications/blob/master/BareServer.md).

## Workers

WebSocket proxying is now fully supported since the previous effort to port the Bare server. This implementation uses KVNamespaces in order to store stateful WebSocket data.

Currently, the namespace name is `BARE`. Any non-JSON strings in the KV namespace will cause the script to break.

## Who this is for

This port requires some technical knowledge (Cloudflare KV, Workers). You will have to modify some code in order to get it working.

## Quickstart

1. Clone this repository

```sh
git clone https://github.com/tomphttp/bare-server-worker.git
```

2. Install

```sh
npm install
```

3. Build

```sh
npm run build
```

Output will contain:

- dist/sw.js - All-in-one service worker. Automatically creates the Bare Server.
- dist/index.js - ESM library. For use in environments where scripts can be imported.

4. Deploy to cloudflare, follow the directions in [the cloudflare deployment guide](Deploy-to-CF.md)
