export const isAllowedOrigin = (
	origin: string | null,
	allowedOrigins: ReadonlySet<string>,
	production: boolean,
): boolean => {
	if (!production) return true;
	if (origin === null) return false;
	return allowedOrigins.has(origin);
};
