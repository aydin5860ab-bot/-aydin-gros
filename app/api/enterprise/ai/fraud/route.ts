import { NextRequest, NextResponse } from 'next/server';
import { checkAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  const auth = await checkAuth(req);
  if (!auth.isAuthenticated) {
    return NextResponse.json({ error: 'Yetkisiz erişim' }, { status: 401 });
  }

  try {
    const body = await req.json();
    const { scan_history, cashier_email, register_id } = body;

    if (!Array.isArray(scan_history) || scan_history.length === 0) {
      return NextResponse.json({ fraud_probability: 0, fraud_alert: false });
    }

    // 1. Analyze timing gaps (Cashier scanning velocity anomalies)
    let timingAnomalyCount = 0;
    let timingScore = 0;
    for (let i = 1; i < scan_history.length; i++) {
      const prev = scan_history[i - 1];
      const curr = scan_history[i];
      const delta = curr.timestamp - prev.timestamp; // in milliseconds

      // Anomalously fast scan (< 400ms) indicates double scan exploits or scanner trickery
      if (delta < 400) {
        timingAnomalyCount++;
        timingScore += 60;
      }
      // Anomalously slow scan (> 15000ms) followed by low-cost items indicates manual bypass collusion
      else if (delta > 15000 && curr.price < 15) {
        timingAnomalyCount++;
        timingScore += 50;
      }
    }

    // 2. Analyze weight vs price mismatches (Sweet-hearting / item-swapping checks)
    let weightScore = 0;
    scan_history.forEach(item => {
      const weight = parseFloat(item.weight || 0); // in kg
      const price = parseFloat(item.price || 0);

      // High weight (e.g. > 1kg) but extremely low price (e.g. < 5 TL)
      if (weight > 1.2 && price < 5.0) {
        weightScore += 80;
      }
      // Zero price item scanned with weight indicates un-scanned heavy goods bypassed
      if (weight > 3.0 && price === 0) {
        weightScore += 100;
      }
    });

    // 3. Cashier risk profiles (mock historical cashier rates)
    let cashierRisk = 10;
    if (cashier_email && cashier_email.includes('merve')) {
      cashierRisk = 40; // Simulated historical risk factor for the test cashier
    }

    // Calculate overall probability index (0 - 100)
    const fraudProbability = Math.min(100, Math.round(
      (timingScore * 0.4) + (weightScore * 0.4) + (cashierRisk * 0.2)
    ));

    const threshold = 85;
    const fraudAlert = fraudProbability >= threshold;

    let anomalyDescription = '';
    if (fraudAlert) {
      if (weightScore > 0 && timingScore > 0) {
        anomalyDescription = 'Reyon ağırlık-fiyat tutarsızlığı ve şüpheli kasa tarama hız düşüşü saptandı.';
      } else if (weightScore > 0) {
        anomalyDescription = 'Ağır sepet ürünlerinde düşük birim fiyatlı barkod eşleme kuşkusu (Sweet-hearting).';
      } else {
        anomalyDescription = 'Anormal tık çiftleme veya kasıtlı geç tarama hızı anomalisi.';
      }
    }

    console.log(`[AI Fraud Detector] Scan History Size: ${scan_history.length}, Risk Score: ${fraudProbability}% (Alert: ${fraudAlert})`);

    return NextResponse.json({
      fraud_probability: fraudProbability,
      fraud_alert: fraudAlert,
      description: anomalyDescription,
      cashier_email: cashier_email || 'unknown',
      register_id: register_id || 'unknown'
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
