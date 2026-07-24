const serverPort = process.env.PORT ?? '3000';
const frontendPort = process.env.VITE_PORT ?? '5173';

const backend = Bun.spawn(['bun', 'run', 'src/server/index.ts'], {
	env: { ...process.env, PORT: serverPort },
	stderr: 'inherit',
	stdout: 'inherit',
});
const frontend = Bun.spawn(
	['bun', 'run', 'vite', 'dev', '--host', '0.0.0.0', '--port', frontendPort],
	{
		env: {
			...process.env,
			SERVER_PORT: serverPort,
			VITE_SERVER_PORT: serverPort,
		},
		stderr: 'inherit',
		stdout: 'inherit',
	},
);

let shuttingDown = false;
const shutdown = (): void => {
	if (shuttingDown) {
		return;
	}
	shuttingDown = true;
	backend.kill('SIGTERM');
	frontend.kill('SIGTERM');
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

const exitCode = await Promise.race([backend.exited, frontend.exited]);
shutdown();
process.exit(exitCode === 0 ? 0 : 1);

export {};
