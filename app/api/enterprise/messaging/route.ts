import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { checkAuth } from '@/lib/auth';
import { readCollection, writeCollection } from '@/lib/db';

const TENANT = process.env.DEFAULT_TENANT_ID ?? '11111111-1111-1111-1111-111111111111';

// Provider Abstraction Layer definition
export interface MessagePayload {
  to: string;
  subject?: string;
  body: string;
  metadata?: any;
}

export interface MessagingProvider {
  sendSMS(payload: MessagePayload): Promise<boolean>;
  sendWhatsApp(payload: MessagePayload): Promise<boolean>;
  sendEmail(payload: MessagePayload): Promise<boolean>;
}

// Enterprise Mock Provider implementing the abstraction layer
class AydınGrosMessagingProvider implements MessagingProvider {
  private tenantId: string;
  private db: any;

  constructor(tenantId: string, db: any) {
    this.tenantId = tenantId;
    this.db = db;
  }

  private async logMessage(channel: 'sms' | 'whatsapp' | 'email', payload: MessagePayload) {
    const logs = await readCollection<any>('messaging_logs', this.tenantId, this.db);
    const newLog = {
      id: `msg-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      tenant_id: this.tenantId,
      to: payload.to,
      channel,
      subject: payload.subject || null,
      body: payload.body,
      status: 'delivered', // simulated success
      created_at: new Date().toISOString()
    };
    logs.push(newLog);
    await writeCollection('messaging_logs', logs, this.tenantId, this.db);
    console.log(`[Messaging Outbox - ${channel.toUpperCase()}] To: ${payload.to} | Body: ${payload.body}`);
    return true;
  }

  async sendSMS(payload: MessagePayload) {
    return this.logMessage('sms', payload);
  }

  async sendWhatsApp(payload: MessagePayload) {
    return this.logMessage('whatsapp', payload);
  }

  async sendEmail(payload: MessagePayload) {
    return this.logMessage('email', payload);
  }
}

export async function GET(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const logs = await readCollection<any>('messaging_logs', tenantId, db);
  return NextResponse.json(logs.sort((a,b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 100));
}

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  const db = createAdminClient();
  if (!db) return NextResponse.json({ error: 'DB bağlantısı yok' }, { status: 500 });

  const tenantId = auth.tenantId || TENANT;
  const body = await req.json();
  const { event, customer_id, phone, email, text } = body;

  const provider = new AydınGrosMessagingProvider(tenantId, db);

  // If text message is directly posted
  if (!event && text && (phone || email)) {
    const payload = { to: phone || email || '', body: text };
    if (phone) {
      await provider.sendWhatsApp(payload);
      await provider.sendSMS(payload);
    } else {
      await provider.sendEmail({ ...payload, subject: 'Aydın Gros Pazarlama' });
    }
    return NextResponse.json({ success: true, message: 'Mesaj gönderildi' });
  }

  // Handle Event Triggers
  if (event && customer_id) {
    const customers = await readCollection<any>('customers', tenantId, db);
    const customer = customers.find(c => c.id === customer_id);
    if (!customer) {
      return NextResponse.json({ error: 'Müşteri bulunamadı' }, { status: 404 });
    }

    const toPhone = customer.phone || '905321111111';
    const toEmail = customer.email || 'info@aydingros.com';
    let bodyText = '';
    let subject = 'Aydın Gros Bildirim';

    if (event === 'birthday') {
      bodyText = `İyi ki doğdunuz ${customer.full_name}! Doğum gününüze özel sepetinizde geçerli %15 indirim kuponunuz: DGUNU15. Keyifli alışverişler dileriz.`;
      subject = 'Mutlu Yıllar! 🎉';
    } else if (event === 'vip_upgrade') {
      bodyText = `Tebrikler ${customer.full_name}! Sadakat puanlarınızla VIP GOLD seviyesine yükseldiniz. Artık her alışverişinizde 1.2 kat puan kazanacaksınız!`;
      subject = 'VIP Kulüp Yükseltmesi 💎';
    } else if (event === 'points_warning') {
      bodyText = `Sayın ${customer.full_name}, sadakat kartınızda biriken puanlarınızın son geçerlilik tarihi yaklaşmaktadır. Hemen harcamak için mağazamıza bekleriz.`;
      subject = 'Puanlarınız Silinmesin! ⏳';
    } else if (event === 'thank_you') {
      bodyText = `Sayın ${customer.full_name}, Aydın Gros'u tercih ettiğiniz için teşekkür ederiz. Alışverişinizden kazandığınız sadakat puanları kartınıza yüklenmiştir.`;
      subject = 'Teşekkür Ederiz! 🙏';
    } else if (event === 'abandoned_cart') {
      bodyText = `Sayın ${customer.full_name}, sepetinizde unuttuğunuz ürünler sizi bekliyor! Alışverişinizi tamamlamanız için özel %10 indirim kuponunuz: SEPET10.`;
      subject = 'Sepetinizi Unutmayın! 🛒';
    } else {
      return NextResponse.json({ error: 'Bilinmeyen event tetikleyici' }, { status: 400 });
    }

    const payload = { to: toPhone, body: bodyText };
    await provider.sendWhatsApp(payload);
    await provider.sendSMS(payload);
    await provider.sendEmail({ to: toEmail, subject, body: bodyText });

    return NextResponse.json({
      success: true,
      event,
      customer_name: customer.full_name,
      message_sent: bodyText
    });
  }

  return NextResponse.json({ error: 'Eksik parametreler' }, { status: 400 });
}
