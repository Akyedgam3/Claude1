import { describe, expect, it } from 'vitest';
import { qrLinkTarget } from '../src/core';

describe('qrLinkTarget', () => {
  it('empty means invoice summary', () => {
    expect(qrLinkTarget('')).toBeNull();
    expect(qrLinkTarget('  ')).toBeNull();
    expect(qrLinkTarget(undefined)).toBeNull();
  });
  it('phone numbers become WhatsApp links', () => {
    expect(qrLinkTarget('0999 123 456')).toBe('https://wa.me/963999123456');
    expect(qrLinkTarget('+90 555 111 2233')).toBe('https://wa.me/905551112233');
    expect(qrLinkTarget('٠٩٩٩١٢٣٤٥٦')).toBe('https://wa.me/963999123456');
  });
  it('links keep or gain https', () => {
    expect(qrLinkTarget('https://maps.app.goo.gl/abc')).toBe('https://maps.app.goo.gl/abc');
    expect(qrLinkTarget('facebook.com/myshop')).toBe('https://facebook.com/myshop');
    expect(qrLinkTarget('www.shop.sy')).toBe('https://www.shop.sy');
    expect(qrLinkTarget('أهلا وسهلا')).toBe('أهلا وسهلا');
  });
});
