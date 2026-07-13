import { describe, expect, it } from 'vitest';
import { sanitizeForLog } from '../../src/main/logging/sanitize';

describe('日志脱敏', () => {
  it('递归遮盖敏感字段且保留普通诊断信息', () => {
    const value = sanitizeForLog({
      apiKey: 'sk-secret',
      request: { authorization: 'Bearer abc', model: 'gpt-test' },
      contextWindow: 8192,
    });
    expect(value).toEqual({
      apiKey: '***',
      request: { authorization: '***', model: 'gpt-test' },
      contextWindow: 8192,
    });
  });

  it('遮盖字符串中的凭据和 Bearer token', () => {
    expect(sanitizeForLog('Authorization: Bearer abc123 apiKey=sk-live'))
      .toBe('Authorization: *** *** apiKey=***');
  });
});
