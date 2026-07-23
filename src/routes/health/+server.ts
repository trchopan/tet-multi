export const prerender = true;

export const GET = (): Response =>
	new Response(JSON.stringify({ status: 'ok' }), {
		headers: {
			'Cache-Control': 'no-store',
			'Content-Type': 'application/json; charset=utf-8',
		},
	});
