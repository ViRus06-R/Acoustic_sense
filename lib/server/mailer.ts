import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

/** Plug a real SMTP provider in by implementing this interface and returning it from mailer(). */
export interface Mailer {
  send(mail: Mail): Promise<{ id: string; file?: string }>;
}

export const DEV_MAIL_DIR = path.join(process.cwd(), "dev-mail");

class DevMailer implements Mailer {
  async send(mail: Mail) {
    const id = `${new Date().toISOString().replace(/[:.]/g, "-")}-${Math.random().toString(36).slice(2, 8)}`;
    const eml = [
      `From: Acoustic Sense <no-reply@acousticsense.local>`,
      `To: ${mail.to}`,
      `Subject: ${mail.subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      mail.text,
      ``,
    ].join("\r\n");
    await mkdir(DEV_MAIL_DIR, { recursive: true });
    const file = path.join(DEV_MAIL_DIR, `${id}.eml`);
    await writeFile(file, eml, "utf8");
    console.log(`\n[dev-mail] To: ${mail.to}\n[dev-mail] Subject: ${mail.subject}\n${mail.text}\n[dev-mail] -> ${file}\n`);
    return { id, file };
  }
}

let instance: Mailer | null = null;
export function mailer(): Mailer {
  if (!instance) instance = new DevMailer();
  return instance;
}

export function appUrl(p: string) {
  return `${process.env.APP_URL ?? "http://localhost:3000"}${p}`;
}
