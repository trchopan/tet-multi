import { resolve } from 'node:path';

export type NodeEnvironment = 'development' | 'production' | 'test';
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface ServerConfig {
	readonly port: number;
	readonly host: string;
	readonly staticRoot: string;
	readonly nodeEnv: NodeEnvironment;
	readonly production: boolean;
	readonly allowedOrigins: ReadonlySet<string>;
	readonly publicBaseUrl?: string;
	readonly logLevel: LogLevel;
	readonly roomEmptyTtlMs: number;
	readonly reconnectGraceMs: number;
	readonly websocketIdleTimeoutSeconds: number;
	readonly shutdownTimeoutMs: number;
	readonly connectionLimit: number;
	readonly roomCreationLimit: number;
}

type Environment = Record<string, string | undefined>;

const parsePositiveInteger = (
	name: string,
	value: string,
	fallback: number,
): number => {
	const parsed = Number(value || fallback);
	if (!Number.isInteger(parsed) || parsed <= 0)
		throw new Error(`${name} must be a positive integer`);
	return parsed;
};

const parseOrigins = (value: string, name: string): ReadonlySet<string> => {
	const origins = value
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean);
	if (origins.length === 0)
		throw new Error(`${name} must contain at least one origin`);
	for (const origin of origins) {
		try {
			const parsed = new URL(origin);
			if (
				!['http:', 'https:'].includes(parsed.protocol) ||
				parsed.pathname !== '/' ||
				parsed.search ||
				parsed.hash
			)
				throw new Error('invalid origin');
		} catch {
			throw new Error(`${name} contains an invalid origin`);
		}
	}
	return new Set(origins.map((origin) => origin.replace(/\/$/, '')));
};

export const loadConfig = (
	environment: Environment = process.env,
): ServerConfig => {
	const port = parsePositiveInteger('PORT', environment.PORT ?? '3000', 3000);
	if (port > 65535) throw new Error('PORT must be between 1 and 65535');
	const nodeEnv = environment.NODE_ENV ?? 'development';
	if (
		nodeEnv !== 'development' &&
		nodeEnv !== 'production' &&
		nodeEnv !== 'test'
	)
		throw new Error('NODE_ENV must be development, production, or test');
	const production = nodeEnv === 'production';
	const origins = environment.ALLOWED_ORIGINS;
	if (production && origins === undefined)
		throw new Error('ALLOWED_ORIGINS is required in production');
	const logLevel = environment.LOG_LEVEL ?? 'info';
	if (!['debug', 'info', 'warn', 'error'].includes(logLevel))
		throw new Error('LOG_LEVEL must be debug, info, warn, or error');
	const publicBaseUrl = environment.PUBLIC_BASE_URL?.trim() || undefined;
	if (publicBaseUrl !== undefined) {
		try {
			const parsed = new URL(publicBaseUrl);
			if (!['http:', 'https:'].includes(parsed.protocol))
				throw new Error('invalid URL');
		} catch {
			throw new Error('PUBLIC_BASE_URL must be a valid HTTP or HTTPS URL');
		}
	}
	return {
		port,
		host: environment.HOST ?? '0.0.0.0',
		staticRoot: resolve(environment.STATIC_ROOT ?? 'build'),
		nodeEnv,
		production,
		allowedOrigins: parseOrigins(
			origins ?? `http://localhost:${port},http://127.0.0.1:${port}`,
			'ALLOWED_ORIGINS',
		),
		...(publicBaseUrl === undefined ? {} : { publicBaseUrl }),
		logLevel: logLevel as LogLevel,
		roomEmptyTtlMs: parsePositiveInteger(
			'ROOM_EMPTY_TTL_MS',
			environment.ROOM_EMPTY_TTL_MS ?? '300000',
			300000,
		),
		reconnectGraceMs: parsePositiveInteger(
			'RECONNECT_GRACE_MS',
			environment.RECONNECT_GRACE_MS ?? '20000',
			20000,
		),
		websocketIdleTimeoutSeconds: parsePositiveInteger(
			'WS_IDLE_TIMEOUT_SECONDS',
			environment.WS_IDLE_TIMEOUT_SECONDS ?? '30',
			30,
		),
		shutdownTimeoutMs: parsePositiveInteger(
			'SHUTDOWN_TIMEOUT_MS',
			environment.SHUTDOWN_TIMEOUT_MS ?? '5000',
			5000,
		),
		connectionLimit: parsePositiveInteger(
			'CONNECTIONS_PER_MINUTE',
			environment.CONNECTIONS_PER_MINUTE ?? '30',
			30,
		),
		roomCreationLimit: parsePositiveInteger(
			'ROOM_CREATIONS_PER_MINUTE',
			environment.ROOM_CREATIONS_PER_MINUTE ?? '5',
			5,
		),
	};
};
