import { mkdtempSync, writeFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { parseCliArgs, runCli } from './evidence-manifest-cli';

describe('parseCliArgs', () => {
  it('--help wins over everything else', () => {
    expect(parseCliArgs(['--help', '--file=x.json', '--execute'])).toEqual({ kind: 'help' });
  });

  it('missing --file is a usage error', () => {
    const result = parseCliArgs(['--offline']);
    expect(result.kind).toBe('usage-error');
  });

  it('empty --file= is a usage error', () => {
    expect(parseCliArgs(['--file=', '--offline']).kind).toBe('usage-error');
  });

  it('--offline with --file resolves to offline mode', () => {
    expect(parseCliArgs(['--file=manifest.json', '--offline'])).toEqual({
      kind: 'offline',
      filePath: 'manifest.json',
    });
  });

  it('--offline combined with --db-name is a usage error (mutually exclusive)', () => {
    expect(parseCliArgs(['--file=m.json', '--offline', '--db-name=phuquochub_staging']).kind).toBe('usage-error');
  });

  it('--offline combined with --execute is a usage error', () => {
    expect(parseCliArgs(['--file=m.json', '--offline', '--execute']).kind).toBe('usage-error');
  });

  it('neither --offline nor --db-name is a usage error — the tool never silently picks a DB', () => {
    expect(parseCliArgs(['--file=m.json']).kind).toBe('usage-error');
  });

  it('--execute without --db-name is a usage error, not a dry-run-against-unknown-db', () => {
    // --db-name is present here only implicitly missing — this is the real footgun case: someone
    // passes --execute expecting it to just work.
    const result = parseCliArgs(['--file=m.json', '--execute']);
    expect(result.kind).toBe('usage-error');
  });

  it('empty --db-name= is a usage error', () => {
    expect(parseCliArgs(['--file=m.json', '--db-name=']).kind).toBe('usage-error');
  });

  it('--db-name without --execute resolves to a dry-run db-run', () => {
    expect(parseCliArgs(['--file=m.json', '--db-name=phuquochub_staging'])).toEqual({
      kind: 'db-run',
      filePath: 'm.json',
      dbName: 'phuquochub_staging',
      execute: false,
    });
  });

  it('--db-name with --execute resolves to an execute db-run', () => {
    expect(parseCliArgs(['--file=m.json', '--db-name=phuquochub_staging', '--execute'])).toEqual({
      kind: 'db-run',
      filePath: 'm.json',
      dbName: 'phuquochub_staging',
      execute: true,
    });
  });
});

describe('runCli — offline mode (no DB, real filesystem in a temp dir)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'evidence-manifest-cli-test-'));
  });
  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('missing file -> exit 1, does not throw', async () => {
    const code = await runCli([`--file=${join(dir, 'does-not-exist.json')}`, '--offline']);
    expect(code).toBe(1);
  });

  it('invalid JSON -> exit 1, fails closed', async () => {
    const file = join(dir, 'bad.json');
    writeFileSync(file, '{ not valid json', 'utf8');
    const code = await runCli([`--file=${file}`, '--offline']);
    expect(code).toBe(1);
  });

  it('valid manifest with a forbidden VERIFIED status -> exit 1 (validator rejects it)', async () => {
    const file = join(dir, 'verified.json');
    writeFileSync(
      file,
      JSON.stringify({
        manifest_version: '1.0',
        generated_by: 'test',
        generated_at: '2026-09-04T00:00:00.000Z',
        entries: [
          {
            place_slug: 'bai-sao',
            source: { external_ref: 'https://example.gov.vn/x', type: 'government', kind: 'url', url: 'https://example.gov.vn/x' },
            evidence: {
              business_key: 'EVD-X',
              evidence_type: 'official_page_capture',
              captured_at: '2026-09-04T00:00:00.000Z',
              verification_status: 'VERIFIED',
            },
            links: [{ field_key: 'short_description', locale_code: 'vi' }],
          },
        ],
      }),
      'utf8',
    );
    const code = await runCli([`--file=${file}`, '--offline']);
    expect(code).toBe(1);
  });

  it('a well-formed manifest -> exit 0', async () => {
    const file = join(dir, 'good.json');
    writeFileSync(
      file,
      JSON.stringify({
        manifest_version: '1.0',
        generated_by: 'test',
        generated_at: '2026-09-04T00:00:00.000Z',
        entries: [
          {
            place_slug: 'bai-sao',
            source: { external_ref: 'https://example.gov.vn/x', type: 'government', kind: 'url', url: 'https://example.gov.vn/x' },
            evidence: {
              business_key: 'EVD-X',
              evidence_type: 'official_page_capture',
              captured_at: '2026-09-04T00:00:00.000Z',
              verification_status: 'NEEDS_REVIEW',
            },
            links: [{ field_key: 'short_description', locale_code: 'vi' }],
          },
        ],
      }),
      'utf8',
    );
    const code = await runCli([`--file=${file}`, '--offline']);
    expect(code).toBe(0);
  });

  it('--help prints usage and exits 0 without touching the filesystem', async () => {
    const code = await runCli(['--help']);
    expect(code).toBe(0);
  });

  it('a bare usage error (no --file at all) exits 2', async () => {
    const code = await runCli([]);
    expect(code).toBe(2);
  });
});
