export type LoggerFields = Record<
	string,
	string | number | boolean | undefined
>;
export type LoggerMethod = (event: string, fields?: LoggerFields) => void;

export interface Logger {
	debug: LoggerMethod;
	info: LoggerMethod;
	warn: LoggerMethod;
	error: LoggerMethod;
}

const levels = { debug: 0, info: 1, warn: 2, error: 3 } as const;
const redacted = new Set([
	'token',
	'reconnectToken',
	'ip',
	'ipAddress',
	'address',
]);

const safeFields = (fields: LoggerFields = {}): LoggerFields => {
	const result: LoggerFields = {};
	for (const [key, value] of Object.entries(fields)) {
		if (redacted.has(key)) continue;
		if (value !== undefined) result[key] = value;
	}
	return result;
};

export const createLogger = (
	level: keyof typeof levels = 'info',
	production = false,
): Logger => {
	const write = (
		severity: keyof typeof levels,
		event: string,
		fields: LoggerFields = {},
	): void => {
		if (levels[severity] < levels[level]) return;
		const payload = {
			timestamp: new Date().toISOString(),
			level: severity,
			event,
			...safeFields(fields),
		};
		if (production) {
			console.log(JSON.stringify(payload));
			return;
		}
		console.log(`[${severity}] ${event}`, safeFields(fields));
	};
	return {
		debug: (event, fields) => write('debug', event, fields),
		info: (event, fields) => write('info', event, fields),
		warn: (event, fields) => write('warn', event, fields),
		error: (event, fields) => write('error', event, fields),
	};
};
