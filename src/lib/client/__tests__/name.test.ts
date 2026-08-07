import { describe, expect, test } from 'bun:test';
import { validateDisplayName } from '$/lib/client/name';

describe('display-name validation', () => {
	test('trims and accepts visible names up to 20 code points', () => {
		expect(validateDisplayName('  Alice  ')).toBeUndefined();
		expect(validateDisplayName('😀'.repeat(20))).toBeUndefined();
	});

	test('rejects empty and overlong names', () => {
		expect(validateDisplayName('   ')).toBe(
			'Choose a display name from 1 to 20 characters.',
		);
		expect(validateDisplayName('a'.repeat(21))).toBe(
			'Choose a display name from 1 to 20 characters.',
		);
	});

	test('rejects control characters', () => {
		expect(validateDisplayName('Alice\n')).toBe(
			'Display names cannot contain control characters.',
		);
	});
});
