import { HttpStatus } from '@nestjs/common';
import { PlaceEditProposalPhotosController } from './place-edit-proposal-photos.controller';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

describe('PlaceEditProposalPhotosController', () => {
  type Ctor = ConstructorParameters<typeof PlaceEditProposalPhotosController>;
  let service: LooseMock<Ctor[0]>;
  let controller: PlaceEditProposalPhotosController;
  const user = { sub: 'u1', email: 'u1@example.com' };

  beforeEach(() => {
    service = createMock<Ctor[0]>({
      presign: jest.fn(),
      register: jest.fn(),
      listMine: jest.fn(),
      resolveOwnerFileUrl: jest.fn(),
      fileUrlTtl: 300 as unknown as never,
    });
    controller = new PlaceEditProposalPhotosController(service);
  });

  it('presign/register: gắn proposalId (route param) + user.sub', () => {
    const presignDto = { content_type: 'image/jpeg', size: 1000, checksum_sha256: 'a'.repeat(64) } as never;
    controller.presign('prop-1', presignDto, user);
    expect(service.presign).toHaveBeenCalledWith('prop-1', 'u1', presignDto);

    const registerDto = { key: 'media/x.jpg' } as never;
    controller.register('prop-1', registerDto, user);
    expect(service.register).toHaveBeenCalledWith('prop-1', 'u1', registerDto);
  });

  it('listMine: gắn proposalId + user.sub', () => {
    controller.listMine('prop-1', user);
    expect(service.listMine).toHaveBeenCalledWith('prop-1', 'u1');
  });

  function fakeResponse() {
    return { setHeader: jest.fn(), redirect: jest.fn() } as unknown as import('express').Response;
  }

  it('file: 302 redirect tới signed URL của chủ đề xuất, Cache-Control private theo nửa TTL', async () => {
    service.resolveOwnerFileUrl.mockResolvedValue('https://signed-url');
    const res = fakeResponse();
    await controller.file('prop-1', 'media-1', user, res);
    expect(service.resolveOwnerFileUrl).toHaveBeenCalledWith('prop-1', 'media-1', 'u1');
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=150');
    expect(res.redirect).toHaveBeenCalledWith(HttpStatus.FOUND, 'https://signed-url');
  });
});
