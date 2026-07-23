import { resolve } from 'node:path';
import { createHttpHandler } from '../src/server/http';

const buildRoot = resolve('build');
const handler = createHttpHandler(buildRoot);

const health = await handler(new Request('http://localhost/health'));
if (health.status !== 200 || (await health.text()) !== '{"status":"ok"}') {
	throw new Error('Production health endpoint verification failed');
}

const root = await handler(new Request('http://localhost/'));
const rootBody = await root.text();
if (
	root.status !== 200 ||
	root.headers.get('content-type')?.includes('text/html') !== true ||
	!rootBody.includes('/_app/')
) {
	throw new Error('Production root route verification failed');
}

let assetCount = 0;
for await (const _asset of new Bun.Glob('_app/**/*').scan({
	cwd: buildRoot,
	onlyFiles: true,
})) {
	assetCount += 1;
}
if (assetCount === 0) {
	throw new Error('Production artifact contains no static client assets');
}

for await (const asset of new Bun.Glob('**/*').scan({
	cwd: buildRoot,
	onlyFiles: true,
})) {
	if (!/\.(?:css|html|js|json|map|svg)$/.test(asset)) {
		continue;
	}
	const body = await Bun.file(resolve(buildRoot, asset)).text();
	if (/webrtc|peer-to-peer/i.test(body)) {
		throw new Error(`Obsolete WebRTC content found in build/${asset}`);
	}
}

console.log(`Production artifact verified (${assetCount} static assets)`);
