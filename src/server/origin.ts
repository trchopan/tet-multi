export const isAllowedOrigin = (
	origin: string | null,
	allowedOrigins: ReadonlySet<string>,
	production: boolean,
): boolean => {
	if (origin === null) return !production;
	return allowedOrigins.has(origin);
};
