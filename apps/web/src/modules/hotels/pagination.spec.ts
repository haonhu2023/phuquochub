import { buildPageList } from './pagination';

describe('buildPageList', () => {
  it('totalPages <= 1 → chỉ trang 1', () => {
    expect(buildPageList(1, 1)).toEqual([1]);
    expect(buildPageList(1, 0)).toEqual([1]);
  });

  it('ít trang (<= 2*siblings+3) → không cần ellipsis', () => {
    expect(buildPageList(2, 4)).toEqual([1, 2, 3, 4]);
  });

  it('trang giữa, nhiều trang → ellipsis cả hai bên', () => {
    expect(buildPageList(10, 20)).toEqual([1, 'ellipsis', 9, 10, 11, 'ellipsis', 20]);
  });

  it('trang đầu → chỉ ellipsis bên phải', () => {
    expect(buildPageList(1, 20)).toEqual([1, 2, 'ellipsis', 20]);
  });

  it('trang cuối → chỉ ellipsis bên trái', () => {
    expect(buildPageList(20, 20)).toEqual([1, 'ellipsis', 19, 20]);
  });

  it('trang 2 (sát đầu) → không có ellipsis thừa ở đầu (1,2,3 liền kề)', () => {
    expect(buildPageList(2, 20)).toEqual([1, 2, 3, 'ellipsis', 20]);
  });
});
