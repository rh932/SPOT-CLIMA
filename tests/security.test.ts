import { describe, it, expect } from 'vitest';
import { pushSubscriptionSchema, surveySubmissionSchema } from '../src/lib/validation';

const keys = { p256dh: 'x', auth: 'y' };

describe('pushSubscriptionSchema — só serviços push conhecidos (SSRF)', () => {
  it.each([
    'https://fcm.googleapis.com/fcm/send/abc',
    'https://updates.push.services.mozilla.com/wpush/v2/abc',
    'https://web.push.apple.com/QGx',
    'https://wns2-bl2p.notify.windows.com/w/?token=abc',
  ])('aceita %s', (endpoint) => {
    expect(pushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(true);
  });

  it.each([
    'http://169.254.169.254/latest/meta-data/',
    'http://localhost:3000/api/admin/admins',
    'http://fcm.googleapis.com/fcm/send/abc',
    'https://fcm.googleapis.com.evil.com/x',
    'https://evil.com/?fcm.googleapis.com',
    'https://10.0.0.1/',
  ])('recusa %s', (endpoint) => {
    expect(pushSubscriptionSchema.safeParse({ endpoint, keys }).success).toBe(false);
  });
});

describe('surveySubmissionSchema — tamanho do payload', () => {
  it('recusa mais de 300 respostas num envio', () => {
    const answers = Array.from({ length: 301 }, () => ({ questionId: 'q1', numericValue: 5 }));
    expect(surveySubmissionSchema.safeParse({ surveyId: 's', sectorId: 'x', unitId: 'u', answers }).success).toBe(false);
  });
});
