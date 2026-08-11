import axios from 'axios';
import { env } from '../config/env';

/**
 * Twilio SMS. Without credentials the message is logged instead of sent so
 * local development (and the OTP flow) still works end to end.
 */
export async function sendSms(to: string, body: string): Promise<boolean> {
  const { accountSid, authToken, fromNumber } = env.twilio;

  if (!accountSid || !authToken || !fromNumber) {
    console.log(`[sms:dev] → ${to}: ${body}`);
    return false;
  }

  try {
    await axios.post(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      new URLSearchParams({ To: to, From: fromNumber, Body: body }),
      {
        auth: { username: accountSid, password: authToken },
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        timeout: 10_000,
      }
    );
    return true;
  } catch (err) {
    console.error('sms send failed:', (err as Error).message);
    return false;
  }
}
