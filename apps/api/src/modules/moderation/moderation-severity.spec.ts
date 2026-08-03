import { computePriority, computeSeverity } from './moderation-severity';
import { ModerationCaseSeverity, ModerationCaseSource } from './moderation.enums';

describe('computeSeverity', () => {
  it.each([
    [ModerationCaseSource.NEW_CONTENT, ModerationCaseSeverity.LOW],
    [ModerationCaseSource.MANUAL, ModerationCaseSeverity.NORMAL],
    [ModerationCaseSource.REPORT, ModerationCaseSeverity.NORMAL],
    [ModerationCaseSource.AI_FLAG, ModerationCaseSeverity.CRITICAL],
  ] as const)('sàn theo source %s (report_count=0, current=low) -> %s', (source, expected) => {
    expect(computeSeverity(ModerationCaseSeverity.LOW, source, 0)).toBe(expected);
  });

  it('KHÔNG bao giờ hạ severity thấp hơn giá trị hiện tại (raise-to-at-least, không phải gán tuyệt đối)', () => {
    // Case new_content backfill đã có severity='normal' (cao hơn sàn 'low' thường lệ của
    // new_content) — report đầu tiên trên nó KHÔNG được hạ về 'low'.
    expect(computeSeverity(ModerationCaseSeverity.NORMAL, ModerationCaseSource.NEW_CONTENT, 1)).toBe(
      ModerationCaseSeverity.NORMAL,
    );
    // Case đã critical (vd AI flag) — report source='report' (sàn 'normal') không được hạ xuống.
    expect(computeSeverity(ModerationCaseSeverity.CRITICAL, ModerationCaseSource.REPORT, 1)).toBe(
      ModerationCaseSeverity.CRITICAL,
    );
  });

  it('report_count >= 3 -> severity tối thiểu high, bất kể source', () => {
    expect(computeSeverity(ModerationCaseSeverity.NORMAL, ModerationCaseSource.REPORT, 3)).toBe(
      ModerationCaseSeverity.HIGH,
    );
    expect(computeSeverity(ModerationCaseSeverity.LOW, ModerationCaseSource.NEW_CONTENT, 3)).toBe(
      ModerationCaseSeverity.HIGH,
    );
  });

  it('report_count = 2 -> KHÔNG áp ngưỡng high (đúng ranh giới >=3, không phải >=2)', () => {
    expect(computeSeverity(ModerationCaseSeverity.NORMAL, ModerationCaseSource.REPORT, 2)).toBe(
      ModerationCaseSeverity.NORMAL,
    );
  });

  it('report_count >= 3 KHÔNG hạ một case đã critical xuống high', () => {
    expect(computeSeverity(ModerationCaseSeverity.CRITICAL, ModerationCaseSource.REPORT, 5)).toBe(
      ModerationCaseSeverity.CRITICAL,
    );
  });
});

describe('computePriority', () => {
  it.each([
    [ModerationCaseSeverity.LOW, 0],
    [ModerationCaseSeverity.NORMAL, 10],
    [ModerationCaseSeverity.HIGH, 30],
    [ModerationCaseSeverity.CRITICAL, 60],
  ] as const)('base(%s) với report_count=0 -> %d (không cộng thêm)', (severity, expectedBase) => {
    expect(computePriority(severity, 0)).toBe(expectedBase);
  });

  it('report_count=1 -> KHÔNG cộng thêm (max(report_count-1,0)=0)', () => {
    expect(computePriority(ModerationCaseSeverity.NORMAL, 1)).toBe(10);
  });

  it('report_count=2 -> +5 (1 report vượt báo cáo đầu tiên × 5)', () => {
    expect(computePriority(ModerationCaseSeverity.NORMAL, 2)).toBe(15);
  });

  it('report_count=3 -> +10', () => {
    expect(computePriority(ModerationCaseSeverity.HIGH, 3)).toBe(40); // 30 + 5*2
  });

  it('cộng thêm bị chặn trần ở +25 (report_count lớn không tăng vô hạn)', () => {
    expect(computePriority(ModerationCaseSeverity.CRITICAL, 100)).toBe(85); // 60 + 25 (trần)
    expect(computePriority(ModerationCaseSeverity.CRITICAL, 7)).toBe(85); // max(7-1,0)*5=30 -> min(30,25)=25
    expect(computePriority(ModerationCaseSeverity.CRITICAL, 6)).toBe(85); // max(6-1,0)*5=25 -> đúng ngưỡng trần
    expect(computePriority(ModerationCaseSeverity.CRITICAL, 5)).toBe(80); // max(5-1,0)*5=20 -> dưới trần
  });
});
