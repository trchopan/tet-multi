import { execFileSync } from 'node:child_process';

execFileSync('bunx', ['playwright', 'test'], {
	stdio: 'inherit',
});
