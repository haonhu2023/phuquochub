import { parseCliArgs } from './content-promotion-export-cli';

describe('content-promotion-export-cli parseCliArgs', () => {
  it('--help wins over everything', () => {
    expect(parseCliArgs(['--help'])).toEqual({ kind: 'help' });
  });

  it('missing --db-name is a usage error', () => {
    expect(parseCliArgs(['--out=x.json']).kind).toBe('usage-error');
  });

  it('missing --out is a usage error', () => {
    expect(parseCliArgs(['--db-name=phuquochub_staging']).kind).toBe('usage-error');
  });

  it('both provided resolves to export mode, slug omitted', () => {
    expect(parseCliArgs(['--db-name=phuquochub_staging', '--out=x.json'])).toEqual({
      kind: 'export', dbName: 'phuquochub_staging', outPath: 'x.json', slug: undefined,
    });
  });

  it('an optional --slug is carried through', () => {
    expect(parseCliArgs(['--db-name=phuquochub_staging', '--out=x.json', '--slug=vinwonders-phu-quoc'])).toEqual({
      kind: 'export', dbName: 'phuquochub_staging', outPath: 'x.json', slug: 'vinwonders-phu-quoc',
    });
  });
});
