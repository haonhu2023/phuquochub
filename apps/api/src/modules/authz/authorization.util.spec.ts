import { grantSatisfies, isAllowed } from './authorization.util';

describe('grantSatisfies', () => {
  it('khớp chính xác', () => {
    expect(grantSatisfies('Category.Manage', 'Category.Manage')).toBe(true);
    expect(grantSatisfies('Category.Manage', 'Category.View')).toBe(false);
  });

  it('wildcard toàn cục `*` khớp mọi thứ', () => {
    expect(grantSatisfies('*', 'Role.Assign')).toBe(true);
    expect(grantSatisfies('*', 'Place.Edit.Own')).toBe(true);
  });

  it('wildcard theo module `Place.*`', () => {
    expect(grantSatisfies('Place.*', 'Place.Edit')).toBe(true);
    expect(grantSatisfies('Place.*', 'Place.Edit.Own')).toBe(true);
    expect(grantSatisfies('Place.*', 'Review.Edit')).toBe(false);
  });

  it('phân cấp scope: Any ⊃ Managed ⊃ Own', () => {
    expect(grantSatisfies('Place.Edit.Any', 'Place.Edit.Own')).toBe(true);
    expect(grantSatisfies('Place.Edit.Managed', 'Place.Edit.Own')).toBe(true);
    expect(grantSatisfies('Place.Edit.Own', 'Place.Edit.Any')).toBe(false);
    expect(grantSatisfies('Place.Edit.Own', 'Place.Edit.Managed')).toBe(false);
  });

  it('grant không scope áp mọi tài nguyên (coi như Any)', () => {
    expect(grantSatisfies('Place.Edit', 'Place.Edit.Own')).toBe(true);
  });

  it('yêu cầu không scope được thỏa bởi grant có scope', () => {
    expect(grantSatisfies('Place.Edit.Own', 'Place.Edit')).toBe(true);
  });
});

describe('isAllowed (deny-by-default)', () => {
  it('cần ít nhất một allow khớp', () => {
    expect(isAllowed(['Category.Manage'], [], 'Category.Manage')).toBe(true);
    expect(isAllowed([], [], 'Category.Manage')).toBe(false);
  });

  it('explicit deny thắng allow', () => {
    expect(isAllowed(['*'], ['Category.Manage'], 'Category.Manage')).toBe(false);
    expect(isAllowed(['Place.*'], ['Place.Delete'], 'Place.Delete')).toBe(false);
  });
});
