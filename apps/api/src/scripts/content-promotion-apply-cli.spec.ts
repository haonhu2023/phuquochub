import { parseCliArgs } from './content-promotion-apply-cli';

describe('content-promotion-apply-cli parseCliArgs', () => {
  it('--help wins over everything', () => {
    expect(parseCliArgs(['--help', '--apply'])).toEqual({ kind: 'help' });
  });

  it('missing --manifest is a usage error', () => {
    expect(parseCliArgs(['--db-name=phuquochub_prod']).kind).toBe('usage-error');
  });

  it('missing --db-name is a usage error — never guesses the target database', () => {
    expect(parseCliArgs(['--manifest=m.json']).kind).toBe('usage-error');
  });

  it('omitting --apply resolves to a dry-run (apply: false)', () => {
    expect(parseCliArgs(['--manifest=m.json', '--db-name=phuquochub_prod'])).toEqual({
      kind: 'run', manifestPath: 'm.json', dbName: 'phuquochub_prod', mappingsPath: undefined, apply: false,
    });
  });

  it('--apply flips apply to true', () => {
    const result = parseCliArgs(['--manifest=m.json', '--db-name=phuquochub_prod', '--apply']);
    expect(result).toMatchObject({ kind: 'run', apply: true });
  });

  it('--mappings is carried through when present', () => {
    const result = parseCliArgs(['--manifest=m.json', '--db-name=phuquochub_prod', '--mappings=map.json']);
    expect(result).toMatchObject({ kind: 'run', mappingsPath: 'map.json' });
  });
});
