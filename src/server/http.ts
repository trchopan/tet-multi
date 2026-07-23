import { resolve } from 'node:path';

const HEALTH_BODY = JSON.stringify({ status: 'ok' });
const IMMUTABLE_CACHE = 'public, max-age=31536000, immutable';

const contentTypeFor = (filePath: string): string => {
	const extension = filePath.split('.').pop()?.toLowerCase();
	const contentTypes: Record<string, string> = {
		css: 'text/css; charset=utf-8',
		gif: 'image/gif',
		html: 'text/html; charset=utf-8',
		ico: 'image/x-icon',
		js: 'text/javascript; charset=utf-8',
		json: 'application/json; charset=utf-8',
		png: 'image/png',
		svg: 'image/svg+xml',
		wasm: 'application/wasm',
		webp: 'image/webp',
		woff: 'font/woff',
		woff2: 'font/woff2',
	};

	return (extension && contentTypes[extension]) ?? 'application/octet-stream';
};

const responseForFile = async (
	filePath: string,
	cacheControl: string,
): Promise<Response> => {
	const file = Bun.file(filePath);
	if (!(await file.exists())) {
		return new Response('Not found', { status: 404 });
	}

	return new Response(file, {
		headers: {
			'Cache-Control': cacheControl,
			'Content-Type': contentTypeFor(filePath),
		},
	});
};

const safePath = (root: string, pathname: string): string | undefined => {
	try {
		const decodedPath = decodeURIComponent(pathname);
		if (
			[...decodedPath].some(
				(character) =>
					character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
			)
		) {
			return undefined;
		}
		const candidate = resolve(root, `.${decodedPath}`);
		return candidate === root || candidate.startsWith(`${root}/`)
			? candidate
			: undefined;
	} catch {
		return undefined;
	}
};

export const createHttpHandler = (
	staticRoot: string,
): ((request: Request) => Promise<Response>) => {
	const root = resolve(staticRoot);
	const indexPath = resolve(root, 'index.html');

	return async (request: Request): Promise<Response> => {
		if (request.method !== 'GET') {
			return new Response('Method not allowed', {
				status: 405,
				headers: { Allow: 'GET' },
			});
		}

		const { pathname } = new URL(request.url);
		if (pathname === '/health') {
			return new Response(HEALTH_BODY, {
				headers: {
					'Cache-Control': 'no-store',
					'Content-Type': 'application/json; charset=utf-8',
				},
				status: 200,
			});
		}

		if (pathname === '/ws') {
			return new Response('WebSocket endpoint is not enabled yet', {
				status: 426,
			});
		}

		const requestedPath = safePath(root, pathname);
		if (!requestedPath) {
			return new Response('Not found', { status: 404 });
		}

		try {
			const requestedFile = Bun.file(requestedPath);
			if (await requestedFile.exists()) {
				const cacheControl =
					pathname === '/' || pathname.endsWith('.html')
						? 'no-cache'
						: IMMUTABLE_CACHE;
				return responseForFile(requestedPath, cacheControl);
			}
		} catch {
			return new Response('Not found', { status: 404 });
		}

		if (pathname.startsWith('/assets/') || pathname.startsWith('/_app/')) {
			return new Response('Not found', { status: 404 });
		}

		return responseForFile(indexPath, 'no-cache');
	};
};
