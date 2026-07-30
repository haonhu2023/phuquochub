import { AvailabilityController } from './availability.controller';
import { PERMISSIONS_KEY } from '../authz/decorators/require-permissions.decorator';

// Controller mỏng (chỉ uỷ quyền) — cùng khuôn BookingsController/PlacesController spec: giá trị
// kiểm thử nằm ở METADATA của decorator, nơi ranh giới bảo mật thực sự được khai báo.
type Handler = keyof AvailabilityController;

function handlerOf(name: Handler): object {
  return AvailabilityController.prototype[name] as unknown as object;
}

describe('AvailabilityController — ranh giới đặc quyền', () => {
  it('list yêu cầu Availability.View', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('list'))).toEqual(['Availability.View']);
  });

  it('create yêu cầu Availability.Manage', () => {
    expect(Reflect.getMetadata(PERMISSIONS_KEY, handlerOf('create'))).toEqual(['Availability.Manage']);
  });
});
