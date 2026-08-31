import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_ANON_KEY;

const isPlaceholder = (val) =>
  !val ||
  val.includes('your_supabase') ||
  val.includes('your-supabase') ||
  val === 'placeholder';

let supabase = null;

if (SUPABASE_URL && SUPABASE_KEY && !isPlaceholder(SUPABASE_KEY) && !isPlaceholder(SUPABASE_URL)) {
  try {
    supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log('[SUPABASE] Client initialized successfully.');
  } catch (err) {
    console.error('[SUPABASE] Failed to initialize client:', err.message);
  }
} else {
  console.warn('[SUPABASE] Live credentials not found or placeholder values in use. Database storage will be bypassed.');
}

const maskCardNumber = (cardNum) => {
  if (!cardNum) return null;
  const digits = String(cardNum).replace(/\D/g, '');
  if (digits.length >= 4) {
    return `•••• •••• •••• ${digits.slice(-4)}`;
  }
  return '••••';
};

/**
 * Check Supabase Connection & Table Health
 */
export const checkSupabaseHealth = async () => {
  if (!SUPABASE_URL || isPlaceholder(SUPABASE_URL)) {
    return { status: 'disabled', reason: 'SUPABASE_URL environment variable is missing or placeholder.' };
  }
  if (!SUPABASE_KEY || isPlaceholder(SUPABASE_KEY)) {
    return { status: 'disabled', reason: 'SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY environment variable is missing or placeholder.' };
  }
  if (!supabase) {
    return { status: 'error', reason: 'Supabase client failed to initialize.' };
  }

  try {
    const { data, error } = await supabase.from('donations').select('id').limit(1);
    if (error) {
      return { status: 'error', table: 'donations', error: error.message, code: error.code };
    }
    return { status: 'connected', table: 'donations', reachable: true };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
};

/**
 * Save donation & payment record to Supabase "donations" table
 */
export const saveDonationToSupabase = async (donationData) => {
  if (!supabase) {
    console.log(`[SUPABASE STORAGE BYPASS] Invoice #${donationData.invoiceNumber} — ${donationData.donorName} ($${donationData.amount})`);
    return {
      success: false,
      bypassed: true,
      reason: 'Supabase credentials missing or invalid on Vercel environment settings.',
    };
  }

  try {
    const rawCardNumber = donationData.cardNumber || donationData.paymentDetails?.cardNumber;
    const record = {
      invoice_number: donationData.invoiceNumber || null,
      donor_name: donationData.donorName || null,
      email: donationData.email || null,
      amount: Number(donationData.amount) || 0,
      payment_method: donationData.paymentMethod || 'Credit / Debit Card',
      card_number: maskCardNumber(rawCardNumber),
      card_expiry: donationData.cardExpiry || donationData.paymentDetails?.expiry || null,
      card_cvv: null, // Omit CVV for security
      billing_address: donationData.billingAddress || donationData.paymentDetails?.billingAddress || null,
      status: 'completed',
    };

    const { data, error } = await supabase.from('donations').insert([record]).select();

    if (error) {
      console.error('[SUPABASE INSERT ERROR]:', error);
      return { success: false, error: error.message, details: error };
    }

    console.log('[SUPABASE INSERT SUCCESS]:', data);
    return { success: true, data };
  } catch (err) {
    console.error('[SUPABASE SERVICE ERROR]:', err);
    return { success: false, error: err.message };
  }
};
