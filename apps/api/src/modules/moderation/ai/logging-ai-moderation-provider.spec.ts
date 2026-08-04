import { Logger } from '@nestjs/common';
import { LoggingAiModerationProvider } from './logging-ai-moderation-provider';
import { ModerationDecision, ModerationTargetType } from '../moderation.enums';

describe('LoggingAiModerationProvider (M7 default provider — deterministic fake, no external HTTP)', () => {
  let logSpy: jest.SpyInstance;

  beforeEach(() => {
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation();
  });

  afterEach(() => {
    logSpy.mockRestore();
  });

  it('CÙNG input -> CÙNG output (xác định, không random) — điều kiện tiên quyết để so sánh được', async () => {
    const provider = new LoggingAiModerationProvider();
    const input = { caseId: 'c1', targetType: ModerationTargetType.MEDIA, targetId: 'm1' };

    const first = await provider.recommend(input);
    const second = await provider.recommend(input);

    expect(second.decision).toBe(first.decision);
    expect(second.confidence).toBe(first.confidence);
    expect(second.labels).toEqual(first.labels);
  });

  it('target khác nhau -> có thể (không bắt buộc luôn) suy ra decision khác nhau — không phải hằng số cố định', async () => {
    const provider = new LoggingAiModerationProvider();
    const decisions = new Set<ModerationDecision>();
    for (let i = 0; i < 20; i += 1) {
      const r = await provider.recommend({
        caseId: 'c1',
        targetType: ModerationTargetType.MEDIA,
        targetId: `m${i}`,
      });
      decisions.add(r.decision);
    }
    expect(decisions.size).toBeGreaterThan(1);
  });

  it('decision luôn thuộc {approve, reject, hide, dismiss} — KHÔNG bao giờ restore (không phải một đảo ngược ban đầu)', async () => {
    const provider = new LoggingAiModerationProvider();
    for (let i = 0; i < 20; i += 1) {
      const r = await provider.recommend({
        caseId: 'c1',
        targetType: ModerationTargetType.REVIEW,
        targetId: `r${i}`,
      });
      expect(r.decision).not.toBe(ModerationDecision.RESTORE);
      expect([
        ModerationDecision.APPROVE,
        ModerationDecision.REJECT,
        ModerationDecision.HIDE,
        ModerationDecision.DISMISS,
      ]).toContain(r.decision);
    }
  });

  it('confidence luôn trong [0,1]', async () => {
    const provider = new LoggingAiModerationProvider();
    for (let i = 0; i < 20; i += 1) {
      const r = await provider.recommend({
        caseId: 'c1',
        targetType: ModerationTargetType.MEDIA,
        targetId: `m${i}`,
      });
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('provider/model/promptVersion cố định, reasoning KHÔNG rỗng, latencyMs >= 0', async () => {
    const provider = new LoggingAiModerationProvider();
    const r = await provider.recommend({ caseId: 'c1', targetType: ModerationTargetType.MEDIA, targetId: 'm1' });

    expect(r.provider).toBe('logging');
    expect(r.model).toBeTruthy();
    expect(r.promptVersion).toBeTruthy();
    expect(r.reasoning).toBeTruthy();
    expect(r.latencyMs).toBeGreaterThanOrEqual(0);
  });

  it('ghi log có cấu trúc, KHÔNG throw — không có network/HTTP call nào (đồng bộ hoá xong ngay)', async () => {
    const provider = new LoggingAiModerationProvider();
    await provider.recommend({ caseId: 'c1', targetType: ModerationTargetType.MEDIA, targetId: 'm1' });

    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining('recommend case=c1'));
  });
});
