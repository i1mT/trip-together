import type { Place } from "../../../shared/places";
import type { Destination } from "../../../shared/travel-options";
export type { Currency } from "../../../shared/travel-options";
import type { Currency } from "../../../shared/travel-options";
export type Trip = {
  destinations?: Destination[];
  id: string;
  title: string;
  owner_id: string;
  start_date: string;
  end_date: string;
  timezone: string;
  home_timezone: string;
  currency: Currency;
  home_currency: Currency;
  version: number;
};
export type PreparationItem = {
  id: string;
  group_name: string;
  title: string;
  note: string;
};
export type Bootstrap = {
  me: Profile;
  trips: Trip[];
  documents: TripDocument[];
};
export type Member = {
  id: string;
  name: string;
  english_name: string;
  has_avatar?: number;
  version?: number;
};
export type Profile = Member & {
  email: string;
  version: number;
  passport: string;
  identity_number: string;
  expiry: string;
};
export type TripEvent = {
  status?: import("../../../shared/event-status").EventStatus;
  dateEnd?: string;
  timeRange?: boolean;
  timeMode?: "timed" | "date";
  endUnspecified?: boolean;
  version: number;
  id: string;
  title: string;
  subtitle: string;
  kind: "flight" | "drive" | "stay" | "explore" | "transfer";
  start: string;
  end: string;
  timezone: string;
  endTimezone?: string;
  certainty: "confirmed" | "suggested";
  place: string;
  address?: string;
  location?: Place | null;
  departureLocation?: Place | null;
  phone?: string;
  source: string;
  note: string;
  documents: string[];
  from?: string;
  to?: string;
  code?: string;
};
export type TripDocument = {
  trip_id?: string | null;
  id: string;
  name: string;
  category: string;
  owner_id: string | null;
  mime: string;
  size: number;
};
export type Receipt = TripDocument & {
  expense_id: string | null;
  uploaded_by: string;
};
export type Expense = {
  created_by?: string;
  source_document_id?: string | null;
  id: string;
  payer_id: string;
  title: string;
  amount: number;
  currency: Currency;
  category: string;
  date: string;
  participants: string[];
  note: string;
  source: string;
  version: number;
};
export type TripData = {
  trip: Trip;
  preparation: PreparationItem[];
  me: Profile;
  members: Member[];
  events: TripEvent[];
  documents: TripDocument[];
  expenses: Expense[];
  receipts: Receipt[];
  packing: string[];
};
export const categories = [
  "住宿",
  "交通",
  "餐饮",
  "活动",
  "购物",
  "其他",
] as const;
