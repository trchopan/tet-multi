export const validateDisplayName = (
	displayName: string,
): string | undefined => {
	const value = displayName.trim();
	if (value.length < 1 || [...value].length > 20)
		return 'Choose a display name from 1 to 20 characters.';
	if (
		[...displayName].some((character) =>
			/[\p{Cc}\p{Cf}\p{Cs}\p{Zl}\p{Zp}]/u.test(character),
		)
	)
		return 'Display names cannot contain control characters.';
	return undefined;
};
