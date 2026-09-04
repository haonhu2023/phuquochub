import { parseCliArgs } from './post-operation-validator-cli';

describe('post-operation-validator-cli parseCliArgs', () => {
  it('--help wins over everything', () => {
    expect(parseCliArgs(['--help', '--file=x.json'])).toEqual({ kind: 'help' });
  });

  it('missing --file is a usage error', () => {
    expect(parseCliArgs(['--db-name=phuquochub_staging']).kind).toBe('usage-error');
  });

  it('missing --db-name is a usage error — this tool never guesses the database', () => {
    expect(parseCliArgs(['--file=x.json']).kind).toBe('usage-error');
  });

  it('empty --file= is a usage error', () => {
    expect(parseCliArgs(['--file=', '--db-name=x']).kind).toBe('usage-error');
  });

  it('empty --db-name= is a usage error', () => {
    expect(parseCliArgs(['--file=x.json', '--db-name=']).kind).toBe('usage-error');
  });

  it('both provided resolves to run mode', () => {
    expect(parseCliArgs(['--file=x.json', '--db-name=phuquochub_staging'])).toEqual({
      kind: 'run',
      filePath: 'x.json',
      dbName: 'phuquochub_staging',
    });
  });
});
