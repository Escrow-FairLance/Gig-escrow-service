import nodemailer from 'nodemailer';
import { config } from '../config/env.js';
import { prisma } from '../db/client.js';

export class MailerService {
  private transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: config.SMTP_HOST,
      port: config.SMTP_PORT,
      secure: config.SMTP_PORT === 465,
      auth:
        config.SMTP_USER !== 'mock'
          ? {
              user: config.SMTP_USER,
              pass: config.SMTP_PASS,
            }
          : undefined,
    });
  }

  /**
   * Dispatches both email and persists in-app notification.
   */
  async notify(input: {
    userAddress: string;
    type: string;
    title: string;
    message: string;
    emailTo?: string;
    data?: Record<string, unknown>;
  }): Promise<void> {
    const deliveredVia: string[] = ['IN_APP'];

    // 1. Create in-app notification in DB
    try {
      await prisma.notification.create({
        data: {
          userAddress: input.userAddress,
          type: input.type,
          title: input.title,
          message: input.message,
          data: input.data as any,
          deliveredVia,
        },
      });
    } catch (err) {
      console.warn('Failed to persist in-app notification:', err);
    }

    // 2. Send email if email address is configured
    if (input.emailTo) {
      try {
        await this.transporter.sendMail({
          from: config.SMTP_FROM,
          to: input.emailTo,
          subject: `[FairLance] ${input.title}`,
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; background: #0f172a; color: #f8fafc; border-radius: 12px; border: 1px solid #1e293b;">
              <h2 style="color: #38bdf8; margin-top: 0;">Escrow-FairLance Notification</h2>
              <h3 style="color: #ffffff;">${input.title}</h3>
              <p style="font-size: 16px; line-height: 1.6; color: #cbd5e1;">${input.message}</p>
              <hr style="border: 0; border-top: 1px solid #334155; margin: 24px 0;" />
              <p style="font-size: 12px; color: #64748b;">This is an automated notification from your FairLance Soroban escrow platform.</p>
            </div>
          `,
        });
        deliveredVia.push('EMAIL');
      } catch (err) {
        console.warn(`Failed to send email to ${input.emailTo}:`, err);
      }
    }
  }
}

export const mailerService = new MailerService();
