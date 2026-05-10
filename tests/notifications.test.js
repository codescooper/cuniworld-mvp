import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// showConfirm renders into document.body — requires jsdom environment.
// We test that user content is NOT injected as raw HTML (XSS prevention).

describe('showConfirm — XSS prevention', () => {
  // Minimal DOM stub: use jsdom (configured in vitest.config or package.json)
  it('renders title as text, not HTML', async () => {
    const { showConfirm } = await import('../src/notifications.js');
    const xssTitle = '<img src=x onerror=alert(1)>';

    // Start confirm (resolves when button clicked)
    const promise = showConfirm({ title: xssTitle, message: 'msg' });

    const overlay = document.querySelector('.confirm-overlay');
    expect(overlay).toBeTruthy();

    const titleEl = overlay.querySelector('.confirm-title');
    // textContent should equal the raw string, NOT parse as HTML
    expect(titleEl.textContent).toBe(xssTitle);
    // innerHTML should be escaped — no <img> element inside title
    expect(overlay.querySelector('.confirm-title img')).toBeNull();

    // Clean up
    overlay.querySelector('[data-testid="confirm-cancel"]').click();
    await promise;
  });

  it('renders message as text, not HTML', async () => {
    const { showConfirm } = await import('../src/notifications.js');
    const xssMsg = '<script>alert(1)</script>';

    const promise = showConfirm({ title: 'T', message: xssMsg });
    const overlay = document.querySelector('.confirm-overlay');
    const msgEl   = overlay.querySelector('.confirm-msg');

    expect(msgEl.textContent).toBe(xssMsg);
    expect(msgEl.innerHTML).not.toContain('<script>');

    overlay.querySelector('[data-testid="confirm-cancel"]').click();
    await promise;
  });

  it('resolves true when confirm button clicked', async () => {
    const { showConfirm } = await import('../src/notifications.js');
    const promise = showConfirm({ title: 'T', message: 'M' });
    document.querySelector('[data-testid="confirm-ok"]').click();
    await expect(promise).resolves.toBe(true);
  });

  it('resolves false when cancel button clicked', async () => {
    const { showConfirm } = await import('../src/notifications.js');
    const promise = showConfirm({ title: 'T', message: 'M' });
    document.querySelector('[data-testid="confirm-cancel"]').click();
    await expect(promise).resolves.toBe(false);
  });
});
