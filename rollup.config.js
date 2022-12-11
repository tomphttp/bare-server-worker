import babel from '@rollup/plugin-babel';
import commonjs from '@rollup/plugin-commonjs';
import json from '@rollup/plugin-json';
import { nodeResolve } from '@rollup/plugin-node-resolve';
import replace from '@rollup/plugin-replace';
import { fileURLToPath } from 'node:url';
import sourcemaps from 'rollup-plugin-sourcemaps';
import typescript from 'rollup-plugin-typescript2';

/**
 * @type {import('rollup').RollupOptions[]}
 */
const config = [
	// all-in-one, instantly setup
	{
		input: 'src/sw.ts',
		output: {
			file: 'dist/sw.js',
			exports: 'none',
			sourcemap: 'inline',
		},
		plugins: [
			nodeResolve({ browser: true }),
			commonjs(),
			json(),
			typescript(),
			babel({ babelHelpers: 'bundled', extensions: ['.ts'] }),
			sourcemaps(),
			replace({
				depd: JSON.stringify(
					fileURLToPath(new URL('./depd/index.js', import.meta.url))
				),
				preventAssignment: true,
				delimiters: ['"', '"'],
			}),
		],
	},
	// library
	/*{
		input: 'src/createServer.ts',
		output: {
			file: 'dist/index.js',
			exports: 'default',
			sourcemap: true,
		},
		plugins: [
			nodeResolve({ browser: true }),
			commonjs(),
			json(),
			typescript(),
			babel({ babelHelpers: 'bundled', extensions: ['.ts'] }),
			sourcemaps(),
		],
	},*/
];

export default config;
