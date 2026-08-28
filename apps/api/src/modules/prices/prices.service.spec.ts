import { NotFoundException } from '@nestjs/common';
import { PricesService } from './prices.service';
import { VerificationStatus } from '../places/place.enums';
import { createMock, LooseMock } from '../../../test/helpers/create-mock';

// Public Beta price trust gate (2026-08-28): sentinel dùng để chứng minh redaction thực sự xảy
// ra (dữ liệu thô CÓ mang giá trị này — nếu test giả không có gì để redact thì không chứng minh
// được gì), và để khoá rằng nó KHÔNG BAO GIỜ lọt ra response public dưới bất kỳ hình thức nào.
const SECRET_PLACE_PRICE = 987652;

function priceRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pr1',
    serviceName: 'Vé vào cổng',
    amount: String(SECRET_PLACE_PRICE),
    currency: 'VND',
    unit: null,
    isFree: false,
    validFrom: null,
    validTo: null,
    verificationStatus: VerificationStatus.PENDING,
    ...overrides,
  };
}

describe('PricesService', () => {
  type Deps = ConstructorParameters<typeof PricesService>;
  let repo: LooseMock<Deps[0]>;
  let service: PricesService;

  beforeEach(() => {
    repo = createMock<Deps[0]>({
      listByEntity: jest.fn(),
      current: jest.fn(),
      findById: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    });
    service = new PricesService(repo);
  });

  afterEach(() => jest.clearAllMocks());

  describe('listByPlace (GET /places/:id/prices — @Public())', () => {
    it('pending → amount redact thành null, sentinel không lộ ra dưới bất kỳ hình thức nào', async () => {
      repo.current.mockResolvedValue([priceRow({ verificationStatus: VerificationStatus.PENDING })]);

      const res = await service.listByPlace('p1', false);

      expect(res[0].amount).toBeNull();
      expect(JSON.stringify(res)).not.toContain(String(SECRET_PLACE_PRICE));
    });

    it.each([VerificationStatus.EXPIRED, VerificationStatus.REJECTED])(
      '%s → vẫn redact (đã từng tin cậy hoặc bị từ chối đều không được lộ raw amount)',
      async (status) => {
        repo.current.mockResolvedValue([priceRow({ verificationStatus: status })]);
        const res = await service.listByPlace('p1', false);
        expect(res[0].amount).toBeNull();
        expect(JSON.stringify(res)).not.toContain(String(SECRET_PLACE_PRICE));
      },
    );

    it.each([VerificationStatus.VERIFIED, VerificationStatus.OFFICIAL, VerificationStatus.COMMUNITY_VERIFIED])(
      '%s → giữ nguyên amount thật',
      async (status) => {
        repo.current.mockResolvedValue([priceRow({ verificationStatus: status })]);
        const res = await service.listByPlace('p1', false);
        expect(res[0].amount).toBe(SECRET_PLACE_PRICE);
      },
    );

    // `?history=true` (mọi bản ghi lịch sử, kể cả đã hết hạn/bị từ chối) đi qua CÙNG toResponse —
    // không có đường vòng nào bỏ qua redaction.
    it('history=true (mọi bản ghi lịch sử) vẫn redact đúng theo trust của TỪNG dòng', async () => {
      repo.listByEntity.mockResolvedValue([
        priceRow({ id: 'old-1', verificationStatus: VerificationStatus.EXPIRED, amount: String(SECRET_PLACE_PRICE) }),
        priceRow({ id: 'old-2', verificationStatus: VerificationStatus.VERIFIED, amount: '150000' }),
      ]);

      const res = await service.listByPlace('p1', true);

      expect(res[0].amount).toBeNull();
      expect(res[1].amount).toBe(150000);
      expect(JSON.stringify(res)).not.toContain(String(SECRET_PLACE_PRICE));
    });

    it('không dùng place status làm proxy — chỉ verification_status của TỪNG dòng giá quyết định', async () => {
      // Không có field nào của "place" được truyền vào đây — listByPlace/toResponse chỉ nhận
      // PriceHistory rows, không có tham chiếu nào tới place.verification_status để lỡ dùng nhầm.
      repo.current.mockResolvedValue([priceRow({ verificationStatus: VerificationStatus.PENDING })]);
      const res = await service.listByPlace('p1', false);
      expect(res[0].amount).toBeNull();
    });

    it('mảng rỗng → trả mảng rỗng, không lỗi', async () => {
      repo.current.mockResolvedValue([]);
      await expect(service.listByPlace('p1', false)).resolves.toEqual([]);
    });

    it('is_free/currency/service_name/unit không bị redact (chỉ amount là "raw price")', async () => {
      repo.current.mockResolvedValue([
        priceRow({ verificationStatus: VerificationStatus.PENDING, unit: 'người', isFree: false }),
      ]);
      const res = await service.listByPlace('p1', false);
      expect(res[0]).toMatchObject({
        service_name: 'Vé vào cổng',
        currency: 'VND',
        unit: 'người',
        is_free: false,
      });
    });
  });

  describe('createForPlace (đặc quyền, KHÔNG redact — actor xem chính giá vừa tạo)', () => {
    it('trả nguyên amount thật, kể cả verification_status mặc định pending', async () => {
      repo.create.mockReturnValue({ id: 'pr1' });
      repo.save.mockResolvedValue(priceRow({ verificationStatus: VerificationStatus.PENDING }));

      const res = await service.createForPlace('p1', {
        service_name: 'Vé vào cổng',
        amount: SECRET_PLACE_PRICE,
      } as Parameters<typeof service.createForPlace>[1]);

      expect(res.amount).toBe(SECRET_PLACE_PRICE);
    });
  });

  describe('update (đặc quyền, KHÔNG redact — actor xem chính giá vừa sửa)', () => {
    it('trả nguyên amount thật dù verification_status chưa tin cậy', async () => {
      repo.findById.mockResolvedValue(priceRow({ verificationStatus: VerificationStatus.PENDING }));
      repo.save.mockImplementation((p) => Promise.resolve(p));

      const res = await service.update('pr1', { amount: SECRET_PLACE_PRICE } as Parameters<
        typeof service.update
      >[1]);

      expect(res.amount).toBe(SECRET_PLACE_PRICE);
    });

    it('không tìm thấy → NotFoundException', async () => {
      repo.findById.mockResolvedValue(null);
      await expect(
        service.update('missing', {} as Parameters<typeof service.update>[1]),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
