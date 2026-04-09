/**
 * Gift cards, vendors, payment providers shared types
 */

export interface Card {
  id: string;
  name: string;
  type?: string;
  status: string;
  remark?: string;
  card_vendors?: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface Vendor {
  id: string;
  name: string;
  status: string;
  remark?: string;
  payment_providers?: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface PaymentProvider {
  id: string;
  name: string;
  status: string;
  remark?: string;
  sort_order?: number;
  created_at?: string;
  updated_at?: string;
}

export interface CreateCardBody {
  name: string;
  type?: string;
  status?: string;
  remark?: string;
  card_vendors?: string;
}

export interface UpdateCardBody {
  name?: string;
  type?: string;
  status?: string;
  remark?: string;
  card_vendors?: string;
  sort_order?: number;
}

export interface CreateVendorBody {
  name: string;
  status?: string;
  remark?: string;
  payment_providers?: string;
}

export interface UpdateVendorBody {
  name?: string;
  status?: string;
  remark?: string;
  payment_providers?: string;
  sort_order?: number;
}

export interface CreateProviderBody {
  name: string;
  status?: string;
  remark?: string;
}

export interface UpdateProviderBody {
  name?: string;
  status?: string;
  remark?: string;
  sort_order?: number;
}
