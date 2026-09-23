import {
  createGuideDraft,
  flagContentGap,
  getGuideDraft,
  listGuideDrafts,
  publishGuideArticle,
  saveGuideDraft,
  unpublishGuideArticle,
} from './guide-editor.api';
import { apiGetAuth, apiPatchAuth, apiPost } from '@/lib/http';

jest.mock('@/lib/http', () => ({
  apiGetAuth: jest.fn(),
  apiPatchAuth: jest.fn(),
  apiPost: jest.fn(),
}));

const mockGet = apiGetAuth as jest.Mock;
const mockPatch = apiPatchAuth as jest.Mock;
const mockPost = apiPost as jest.Mock;

beforeEach(() => {
  mockGet.mockReset();
  mockPatch.mockReset();
  mockPost.mockReset();
});

describe('listGuideDrafts', () => {
  it('GET /admin/guide-articles với token', async () => {
    await listGuideDrafts('tok');
    expect(mockGet).toHaveBeenCalledWith('/admin/guide-articles', 'tok');
  });
});

describe('getGuideDraft', () => {
  it('GET /admin/guide-articles/:id với token', async () => {
    await getGuideDraft('g1', 'tok');
    expect(mockGet).toHaveBeenCalledWith('/admin/guide-articles/g1', 'tok');
  });
});

describe('createGuideDraft', () => {
  it('POST /admin/guide-articles với payload + token', async () => {
    const input = { slug: 'phu-quoc', locale: 'vi' as const, title: 'X', blocks: [] };
    await createGuideDraft(input, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/admin/guide-articles', 'tok', input);
  });
});

describe('saveGuideDraft', () => {
  it('PATCH /admin/guide-articles/:id với payload (kèm expectedContentVersion) + token', async () => {
    const input = { title: 'X', blocks: [], expectedContentVersion: 3 };
    await saveGuideDraft('g1', input, 'tok');
    expect(mockPatch).toHaveBeenCalledWith('/admin/guide-articles/g1', 'tok', input);
  });
});

describe('publishGuideArticle', () => {
  it('POST /admin/guide-articles/:id/publish với expectedContentVersion + token', async () => {
    await publishGuideArticle('g1', 3, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/admin/guide-articles/g1/publish', 'tok', { expectedContentVersion: 3 });
  });
});

// G-B (2026-09-22)
describe('unpublishGuideArticle', () => {
  it('POST /admin/guide-articles/:id/unpublish với expectedContentVersion + token', async () => {
    await unpublishGuideArticle('g1', 4, 'tok');
    expect(mockPost).toHaveBeenCalledWith('/admin/guide-articles/g1/unpublish', 'tok', { expectedContentVersion: 4 });
  });
});

describe('flagContentGap', () => {
  it('POST /admin/guide-articles/:id/flag-gap với blockId/note + token', async () => {
    await flagContentGap('g1', 'b1', 'thiếu nguồn', 'tok');
    expect(mockPost).toHaveBeenCalledWith('/admin/guide-articles/g1/flag-gap', 'tok', {
      blockId: 'b1',
      note: 'thiếu nguồn',
    });
  });
});
