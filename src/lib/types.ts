// ---------------------------------------------------------------- staff (admin database)
export type Platform = 'eden' | 'shop' | 'ad'
export const PLATFORM_LABEL: Record<Platform, string> = { shop: 'UKOshop', eden: 'Eden', ad: 'UKOapp' }

/** admin.staff row (GET /api/auth/me, GET /api/staff) */
export type Staff = {
  staff_id: string; name: string; role: string; email: string; telephone: string; location: string; office: string; platform: Platform; since: string | null
}
/** admin.staff_salaries row (GET/PUT /api/staff/salaries) — monthly KSh per role; main admin only */
export type StaffSalary = { role: string; amount: number; staff_count: number; updated_by: string; updated_at: string | null }
export type LoginCodeSent = { sent: boolean; to: string; expires_in: number; resend_in: number }
export type LoginResponse = { token: string; expires_at: string; expires_in: number; user: Staff }

// ---------------------------------------------------------------- UKOshop (shop database)
export type Shelve = {
  id: number; name: string; owner_name: string; owner_users_id: number | null; licence: string; country: string; county: string; ward: string
  address: string; landmark: string; contact_phone: string; contact_email: string; extra_contacts: { label: string; value: string }[]
  opening_time: string; closing_time: string; open_sunday: boolean; sunday_hours: string; delivery_fee: number
  barter_fee: number; capacity: number; image: string; status: string; is_open: boolean; lat: number | null; lng: number | null; relocating_date: string | null
  termination_requested: boolean; company_email: string; items_count?: number; capacity_used_pct?: number; slots_free?: number
}
export type Rider = {
  id: number; name: string; phone: string; alt_phone: string; email: string; vehicle_type: string; number_plate: string; rating: number; drops: number
  wards: string[]; days: string[]; start_time: string; end_time: string; is_online: boolean; avatar: string; company_email: string
}

// ---------------------------------------------------------------- Eden + UKOapp (uko database)
export type Paged<K extends string, T> = { total: number; page: number; per_page: number } & Record<K, T[]>
export type EdenOverview = {
  studios: number; people: number; followers: number; content: Record<'movie' | 'tv' | 'season' | 'episode', number>
  wallet_total: number; withdrawn_total: number; recent_withdrawals: { id: number; eden_id: number; studio: string; amount: number; time: string | null }[]
}
export type EdenStudio = { id: number; name: string; phone: string; joined: string | null; followers: number; earned: number; withdrawn: number; balance: number }
export type EdenContent = { id: number; type: string; media_id: number; title: string; release_date: string; poster_path: string; vote_average: number | null; added: string | null }
export type UkoappOverview = {
  users: number; views: number; views_by_platform: Record<string, number>; likes: number; playlists: number; credits_in: number; credits_out: number
  payments: Record<string, number>; feedback: number; newsletter: number
}
export type UkoappUser = { id: number; name: string; email: string; telephone: string; signed_in: boolean; joined: string | null; views: number; credits: number }
export type UkoappPayment = { id: number; method: string; email: string; status: string; app: string; time: string | null }
// UKOapp → Reactions (admin/back-end /ukoapp/reactions): party fees by the credits that paid them
export type ReactionFees = {
  fees: number; credits: number; by_source: { subscribed: number; ad: number; free: number }
  host_credits: number; uko_credits: number; uko_ksh: number
}
export type ReactionsSummary = ReactionFees & { parties: number; open: number; paid_parties: number; members: number; host_ksh: number }
export type ReactionRow = ReactionFees & {
  id: number; code: string; title: string; content_type: string; eden: boolean; fee: number; listed: boolean
  status: 'open' | 'ended'; started: string | null; ended: string | null; host: string; members: number; host_ksh: number
}
// UKOapp → Offline sales (admin/back-end /ukoapp/offline-sales): videos sold phone to phone, 70% seller / 30% UKO
export type OfflineSalesSummary = {
  sales: number; sellers: number; gross_ksh: number; seller_ksh: number; uko_ksh: number; uko_booked_ksh: number
  host_ksh: number; paid_out_ksh: number; pending_ksh: number; failed_withdrawals: number; owed_ksh: number
}
export type OfflineSaleRow = {
  id: number; title: string; eden: boolean; price: number; seller_ksh: number; uko_ksh: number; status: string
  seller: string; buyer: string; created: string | null; paid: string | null
}
export type UkoappFeedback = { id: number; name: string; email: string; subject: string; message: string; time: string | null }

// ---------------------------------------------------------------- Blockbusters + producers (admin/back-end routers/producers.py)
/** credits_out charges of a blockbuster movie / series (app/blockbuster.py). `producer_ksh` is the 3:2 share held. */
export type ViewStats = {
  views: number; paid_views: number; viewers: number; downloads: number
  sources: { paid: number; ad: number; ukoshop: number; mixed: number; free: number }
  revenue_ksh: number; producer_ksh: number; uko_ksh: number; first_view: string | null; last_view: string | null
}
export type OutreachStatus = 'new' | 'researching' | 'contacted' | 'replied' | 'negotiating' | 'onboarded' | 'declined' | 'no_response'
export type Outreach = {
  status: OutreachStatus; rights_holder: string; contact_name: string; contact_email: string; contact_phone: string
  assigned_to: string; producer_id: number | null; last_contact_at: string | null; next_step_at: string | null; updated_at: string | null
}
export type ClaimRef = { title_id: number; status: string; producer_id: number; producer: string; account_no: string }
export type BlockbusterRow = Omit<ViewStats, 'downloads'> & {
  kind: 'movie' | 'tv'; tmdb_id: number; title: string; year: string; poster: string; companies: string[]
  outreach: Outreach; claimed_by: ClaimRef | null; pending_claims: number
}
export type BlockbusterSummary = {
  threshold: number; titles: number; views: number; producer_ksh: number; held_unclaimed_ksh: number; onboarded: number
  in_progress: number; watched_titles: number; computed_at: string
}
export type PeriodRow = { period: string; views: number; paid_views: number; revenue_ksh: number; producer_ksh: number; uko_ksh: number }
export type BlockbusterDetail = {
  kind: 'movie' | 'tv'; tmdb_id: number; title: string; year: string; poster: string; backdrop: string; overview: string
  companies: string[]; countries: string[]; totals: ViewStats; months: PeriodRow[]; days: PeriodRow[]
  regions: { place: string; viewers: number }[]; episodes: number | null; outreach: Outreach
  email: { to: string; subject: string; body: string; mailto: string }
  notes: { id: number; staff: string; body: string; time: string | null }[]
  claims: (ClaimRef & { rights_region: string; note: string; time: string | null })[]
}
export type ProducerMoney = { earned_ksh: number; paid_ksh: number; requested_ksh: number; balance_ksh: number; views: number }
export type ProducerQueue = { claims: number; documents: number; payouts: number }
export type Producer = {
  id: number; account_no: string; name: string; contact_name: string; email: string; phone: string; country: string; address: string
  status: 'active' | 'suspended'; notes: string; password_set: boolean; last_login_at: string | null; created_at: string | null
  created_by: string; money: ProducerMoney; queue: ProducerQueue; titles?: number
}
export type ProducerTitle = {
  id: number; kind: 'movie' | 'tv'; tmdb_id: number; title: string; poster: string; rights_region: string
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn'; note: string; submitted_by: string; reviewed_by: string
  reviewed_at: string | null; created_at: string | null; stats: ViewStats | null
}
export type ProducerDocument = {
  id: number; title_id: number | null; kind: string; name: string; url: string; status: 'pending' | 'approved' | 'rejected'
  note: string; reviewed_by: string; reviewed_at: string | null; created_at: string | null
}
/** The bank account a producer gave on a payment request — finance transfers to it by hand. */
export type ProducerBank = {
  bank_name: string; bank_branch: string; bank_account_name: string; bank_account_number: string; swift_code: string
  bank_country: string; currency: string; summary: string
}
export type ProducerPayout = {
  id: number; producer_id: number; amount: number; status: 'requested' | 'paid' | 'rejected' | 'cancelled'; reference: string
  note: string; bank: ProducerBank; requested_at: string | null; paid_at: string | null; decided_by: string; decided_at: string | null
  producer?: string; account_no?: string; balance_ksh?: number
}
export type ProducerDetail = Omit<Producer, 'titles'> & {
  titles: ProducerTitle[]; documents: ProducerDocument[]; payouts: ProducerPayout[]
}
/** POST /ukoapp/producers and /producers/{id}/link */
export type ProducerAccountResult = { id?: number; email: string; account_no: string; link_sent: boolean; link?: string }

// ---------------------------------------------------------------- Safety (admin/back-end app/routers/safety.py)
/** GET /api/shop/incidents — a rider (on a delivery, or on an item pick-up carrying a seller's item to a shelf) or an
 *  inter-county courier driver whose phone stopped sending fixes while goods were in his hands. All kinds share one
 *  shape; `key` ("rider-12" / "pickup-4" / "courier-3") is unique across kinds, `id` only within its kind. `person` is
 *  the rider or the driver; `tracking_no` is the waybill for a courier and the job number ("PU-…") for a pick-up. */
export type IncidentKind = 'rider' | 'pickup' | 'courier'
export type IncidentLevel = 'warning' | 'missing'
export type IncidentStatus = 'open' | 'reported_to_police' | 'recovered' | 'closed'
export type TrailPoint = { lat: number; lng: number; accuracy: number | null; at: string | null }
export type DeliveryEvent = { title?: string; sub?: string; time?: string; status?: string; note?: string; at?: string }
export type IncidentPerson = {
  id: number; name: string; phone: string; alt_phone: string; plate: string; vehicle: string; national_id: string; users_id: number | null; status: string
  licence_no?: string; insured?: boolean; insurer?: string; insurance_expires?: string | null
}
export type LegEnd = { county: string; ward: string; shelf: string; shelf_id: number | null; label: string }
/** The item pick-up a rider was on (pickup_jobs + the item, the seller and the shelf). */
export type PickupJobInfo = {
  id: number; job_no: string; status: string; item_id: number; item_title: string; item_code: string; item_image: string
  seller_users_id: number; seller_name: string; seller_store: string; seller_phone: string
  pickup_address: string; pickup_lat: number | null; pickup_lng: number | null; pickup_maps_url: string
  shelf_id: number | null; shelf_name: string; shelf_ward: string; shelf_phone: string; shelf_address: string
  vehicle: string; distance_km: number; fee: number; accepted_at: string | null; collected_at: string | null
}
export type Incident = {
  id: number; kind: IncidentKind; key: string; tracking_no: string; waybill_no?: string
  level: IncidentLevel; status: IncidentStatus; minutes_since_seen: number | null
  last_seen_at: string | null; last_lat: number | null; last_lng: number | null; last_accuracy: number | null; last_battery: number | null
  maps_url: string; directions_url: string; tracking_url: string
  person: IncidentPerson | null
  /** rider and pick-up incidents (same object as person) */
  rider?: IncidentPerson | null
  delivery?: { id: number; status: string; order_no: string; destination: string; destination_ward: string; fee: number } | null
  /** pick-up incidents only */
  job_no?: string
  job?: PickupJobInfo | null
  /** courier incidents only */
  courier?: IncidentPerson | null
  leg?: { id: number; status: string; order_no: string; origin: LegEnd; destination: LegEnd; distance_km: number; fee: number; parcel_class: string; weight_kg: number; departed_at: string | null } | null
  parcel: { items: { title: string; code: string; qty: number; value: number }[]; total_value: number }
  police_station: string; police_ob: string; reported_at: string | null; reported_by: string; notes: string
  opened_at: string | null; escalated_at: string | null; recovered_at: string | null; closed_at: string | null
  claim: { id: number; claim_no: string; status: string } | null
  trail?: TrailPoint[]; events?: DeliveryEvent[]
}
export type IncidentCounts = { missing: number; warning: number; reported: number; active: number }
/** `counts` are active totals across every kind whatever the `kind` filter; `by_kind` splits them. */
export type IncidentList = { incidents: Incident[]; counts: IncidentCounts; by_kind: Record<IncidentKind, IncidentCounts> }

/** GET /api/shop/insurance/claims — a UKO goods cover claim (shared spec claim_dict + console extras). */
export type ClaimStatus = 'submitted' | 'under_review' | 'approved' | 'rejected' | 'paid'
export type PayoutRole = 'seller' | 'shelve' | 'rider' | 'courier' | 'buyer' | 'external'
export type InsuranceClaim = {
  id: number; claim_no: string; party_role: 'rider' | 'shelve' | 'courier'; party_id: number; ref_type: string; ref_id: number | null; ref_no: string
  kind: 'lost' | 'damaged' | 'stolen'; description: string; items: { title: string; code?: string; value: number }[]
  amount_claimed: number; cover_limit: number; excess: number; payable: number; evidence: string[]
  police_station: string; police_ob: string; status: ClaimStatus; amount_approved: number; payout_role: string; payout_ref: string
  decision_note: string; created_at: string | null; decided_at: string | null
  filed_by: string; filed_by_users_id: number | null; incident_id: number | null; payout_to_users_id: number | null; decided_by: string; updated_at: string | null
  party: { name: string; phone: string }
  /** users_id is 0 for a partner (shelve / rider / courier) with no linked shop account; partner_id is its row */
  payout_candidates: { users_id: number; partner_id?: number; role: PayoutRole; name: string; phone: string }[]
}

/** GET /api/signed-in/summary — one card per app; signed_in/total null (with `error`) when that app's columns are not migrated */
export type SignedInSummary = { key: string; app: string; signed_in: number | null; total: number | null; error: string | null }
/** GET /api/signed-in/{key} — a signed-in account and its most recent active session (sessions_count null for apps without a sessions table) */
export type SignedInAccount = {
  id: string; name: string; contact: string; last_login_at: string | null; last_seen_at: string | null; expires_at: string | null
  device: string; ip: string; user_agent: string; sessions_count: number | null
  /** users.verification.apps, one per app the account has signed in to (UKOapp users only, else null) */
  apps: { platform: string; is_logged_in: boolean }[] | null
}
