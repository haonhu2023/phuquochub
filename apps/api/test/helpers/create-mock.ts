// Test-only helper: dựng test double cho dependency NestJS trong unit test (new + mock).
// LooseMock<T> để mọi method là jest.Mock — mockResolvedValue/mockReturnValue nhận dữ liệu
// rút gọn của test — nhưng vẫn là mapped type đồng cấu trên T nên gán được cho tham số
// constructor kiểu T (giữ nhận diện class dù T có private member). Nhờ đó unit test không
// phải dùng `any` hay `as unknown as` để vượt qua kiểm tra kiểu.
export type LooseMock<T> = { [K in keyof T]: jest.Mock } & T;

export function createMock<T>(impl: Partial<{ [K in keyof T]: jest.Mock }> = {}): LooseMock<T> {
  return impl as LooseMock<T>;
}
