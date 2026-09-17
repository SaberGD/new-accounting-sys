import { auth } from '../firebase';

const endpoint = 'https://us-central1-sg-crm-e3a38.cloudfunctions.net/accountingCrmBridge';

async function callCrm<T>(payload: Record<string, unknown>): Promise<T> {
  const user = auth.currentUser;
  if (!user) throw new Error('Please sign in again to connect to CRM.');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${await user.getIdToken()}`,
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error || 'CRM integration is unavailable.');
  return result as T;
}

export interface CrmLookupResult {
  found: boolean;
  ambiguous?: boolean;
  client?: {
    id: string;
    name: string;
    status: string;
    serviceName: string;
    isBooked: boolean;
    salesAgentName?: string;
    lastFollowUpDate?: number | null;
  };
}

export const lookupCrmClient = (phone: string, countryCode: string) =>
  callCrm<CrmLookupResult>({ action: 'lookup', phone, countryCode });

export const syncBookingToCrm = (bookingId: string) =>
  callCrm<{ success: boolean; action: 'updated' | 'already_synced' | 'no_match'; clientId?: string }>({ action: 'syncBooking', bookingId });
