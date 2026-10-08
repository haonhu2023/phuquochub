import { HttpStatus } from '@nestjs/common';
import { RealEstateListingPhotosController } from './real-estate-listing-photos.controller';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('RealEstateListingPhotosController', () => {
  type Ctor = ConstructorParameters<typeof RealEstateListingPhotosController>;
  let service: LooseMock<Ctor[0]>;
  let controller: RealEstateListingPhotosController;
  const user = { sub: 'u1', email: 'u1@example.com' };

  beforeEach(() => {
    service = createMock<Ctor[0]>({
      presign: jest.fn(),
      register: jest.fn(),
      listPublic: jest.fn(),
      listMine: jest.fn(),
      resolvePublicFileUrl: jest.fn(),
      resolveOwnerFileUrl: jest.fn(),
      remove: jest.fn(),
      fileUrlTtl: 300 as unknown as never,
    });
    controller = new RealEstateListingPhotosController(service);
  });

  it('presign/register: gắn listingId (route param) + user.sub', () => {
    const presignDto = { content_type: 'image/jpeg', size: 1000, checksum_sha256: 'a'.repeat(64) } as never;
    controller.presign('rel-1', presignDto, user);
    expect(service.presign).toHaveBeenCalledWith('rel-1', 'u1', presignDto);

    const registerDto = { key: 'real-estate-listing-photos/x.jpg' } as never;
    controller.register('rel-1', registerDto, user);
    expect(service.register).toHaveBeenCalledWith('rel-1', 'u1', registerDto);
  });

  it('listPublic: công khai, không đụng user', () => {
    controller.listPublic('rel-1');
    expect(service.listPublic).toHaveBeenCalledWith('rel-1');
  });

  it('listMine: dùng user.sub', () => {
    controller.listMine('rel-1', user);
    expect(service.listMine).toHaveBeenCalledWith('rel-1', 'u1');
  });

  it('remove: gắn listingId + photoId + user.sub, trả null', async () => {
    const result = await controller.remove('rel-1', 'photo-1', user);
    expect(service.remove).toHaveBeenCalledWith('rel-1', 'photo-1', 'u1');
    expect(result).toBeNull();
  });

  function fakeResponse() {
    return { setHeader: jest.fn(), redirect: jest.fn() } as unknown as import('express').Response;
  }

  it('file: 302 redirect tới signed URL công khai, Cache-Control private theo nửa TTL', async () => {
    service.resolvePublicFileUrl.mockResolvedValue('https://signed-url');
    const res = fakeResponse();
    await controller.file('rel-1', 'photo-1', res);
    expect(service.resolvePublicFileUrl).toHaveBeenCalledWith('rel-1', 'photo-1');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=150');
    expect(res.redirect).toHaveBeenCalledWith(HttpStatus.FOUND, 'https://signed-url');
  });

  it('ownerFile: 302 redirect tới signed URL kênh chủ tin, dùng user.sub', async () => {
    service.resolveOwnerFileUrl.mockResolvedValue('https://owner-signed-url');
    const res = fakeResponse();
    await controller.ownerFile('rel-1', 'photo-1', user, res);
    expect(service.resolveOwnerFileUrl).toHaveBeenCalledWith('rel-1', 'photo-1', 'u1');
    expect(res.redirect).toHaveBeenCalledWith(HttpStatus.FOUND, 'https://owner-signed-url');
  });
});
