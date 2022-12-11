# TOMP Bare Server

This repository implements the TompHTTP bare server. See the specification [here](https://github.com/tomphttp/specifications/blob/master/BareServer.md).

## Workers

Due to the limitations of web workers, we cannot handle WebSockets. This will severely limit the usage of this implementation.

## Quickstart

1. Clone this repository

```sh
$ git clone https://github.com/tomphttp/bare-server-worker.git
```

2. Install

```sh
$ npm install
```

3. Build

```
$ npm run build
```

Output will contain:

- dist/sw.js - All-in-one service worker. Automatically creates the Bare Server.
- dist/index.js - ESM library. For use in environments where scripts can be imported.
