import { Injectable, NotFoundException } from '@nestjs/common';
import { LocalesRepository } from './repositories/locales.repository';
import { SupportedLocale } from './entities/supported-locale.entity';

// Nền tảng locale (ADR-020). Không có production-write job ở đây — chỉ tra cứu/kiểm tra locale mà
// mọi module i18n khác (place-translations, và sau này SEO/route) đều cần dùng chung, để không nơi
// nào tự ý hardcode 'vi'/'en' hay tự viết lại logic chuẩn hoá mã BCP-47.
@Injectable()
export class LocalesService {
  constructor(private readonly localesRepo: LocalesRepository) {}

  // Chuẩn hoá casing BCP-47 (RFC 5646 §2.1.1): subtag ngôn ngữ viết thường, script (4 chữ cái)
  // Titlecase, region (2 chữ cái) viết hoa; các subtag khác (biến thể, số vùng UN M49…) giữ nguyên
  // dạng thường. Đây thuần là chuẩn hoá biểu diễn — KHÔNG xác nhận mã có tồn tại trong
  // supported_locales; dùng getKnownLocale() cho việc đó.
  normalizeLocaleCode(rawCode: string): string {
    return rawCode
      .trim()
      .split('-')
      .map((subtag, index) => {
        if (index === 0) return subtag.toLowerCase();
        if (/^[A-Za-z]{4}$/.test(subtag)) {
          return subtag[0].toUpperCase() + subtag.slice(1).toLowerCase();
        }
        if (/^[A-Za-z]{2}$/.test(subtag)) {
          return subtag.toUpperCase();
        }
        return subtag.toLowerCase();
      })
      .join('-');
  }

  async getKnownLocale(localeCode: string): Promise<SupportedLocale> {
    const normalized = this.normalizeLocaleCode(localeCode);
    const locale = await this.localesRepo.findByCode(normalized);
    if (!locale) {
      throw new NotFoundException(`Unknown locale_code: ${normalized}`);
    }
    return locale;
  }

  // MAP-033: một locale PLANNED không bao giờ được coi là public/production, dù CHECK constraint
  // đã ép ở tầng DB — hàm này là điểm kiểm tra tường minh ở tầng ứng dụng trước khi service khác
  // (place-translations) cho phép publish vào một locale.
  async assertPublishableLocale(localeCode: string): Promise<SupportedLocale> {
    const locale = await this.getKnownLocale(localeCode);
    if (!locale.isPublic || !locale.isProductionData) {
      throw new NotFoundException(
        `Locale ${locale.localeCode} is not publishable (is_public=${locale.isPublic}, is_production_data=${locale.isProductionData})`,
      );
    }
    return locale;
  }

  // Public Place i18n Read Path — nguồn locale duy nhất được tin cậy cho toàn bộ hợp đồng đọc
  // công khai (?locale= querystring hôm nay; nguồn khác nếu thêm sau này đều gọi qua đây, không
  // tự viết lại). Một mã locale sai/chưa publishable (NotFoundException — xem getKnownLocale/
  // assertPublishableLocale) KHÔNG được phép làm sập request công khai: coi như client không chỉ
  // định gì và rơi về locale mặc định. Lỗi hạ tầng (DB/repository) KHÔNG được coi là "locale sai"
  // — phải propagate nguyên trạng, không fallback che giấu và không kéo theo một query mặc định
  // thứ hai chạy trên một DB có thể đang down.
  async resolveRequestLocale(requestedLocaleCode?: string | null): Promise<SupportedLocale> {
    if (requestedLocaleCode) {
      try {
        return await this.assertPublishableLocale(requestedLocaleCode);
      } catch (error) {
        if (!(error instanceof NotFoundException)) {
          throw error;
        }
        // Mã không tồn tại hoặc chưa publishable — rơi về mặc định thay vì 500.
      }
    }
    return this.getDefaultLocale();
  }

  listAll(): Promise<SupportedLocale[]> {
    return this.localesRepo.findAll();
  }

  listPublic(): Promise<SupportedLocale[]> {
    return this.localesRepo.findPublic();
  }

  async getDefaultLocale(): Promise<SupportedLocale> {
    const locale = await this.localesRepo.findDefault();
    if (!locale) {
      throw new NotFoundException('No default locale configured in supported_locales');
    }
    return locale;
  }
}
