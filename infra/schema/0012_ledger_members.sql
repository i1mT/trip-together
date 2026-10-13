CREATE TABLE ledger_members (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES members(id),
  display_name TEXT NOT NULL,
  status TEXT NOT NULL CHECK(status IN ('placeholder','claimed')),
  claimed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX ledger_members_trip ON ledger_members(trip_id, created_at);
CREATE UNIQUE INDEX ledger_members_user ON ledger_members(trip_id, user_id) WHERE user_id IS NOT NULL;

CREATE TABLE member_claims (
  id TEXT PRIMARY KEY,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL,
  action TEXT NOT NULL CHECK(action IN ('claim','unclaim','merge')),
  actor_id TEXT,
  from_user_id TEXT,
  to_user_id TEXT,
  target_member_id TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX member_claims_trip ON member_claims(trip_id, created_at);

INSERT INTO ledger_members (id, trip_id, user_id, display_name, status, claimed_at, created_at)
SELECT lower(hex(randomblob(16))), tm.trip_id, tm.member_id, m.name, 'claimed', tm.joined_at, tm.joined_at
FROM trip_members tm
JOIN members m ON m.id = tm.member_id;

ALTER TABLE expenses ADD COLUMN payer_member_id TEXT;
ALTER TABLE expenses ADD COLUMN fx_rate_ppm INTEGER;
ALTER TABLE expenses ADD COLUMN amount_cny_estimated INTEGER;
ALTER TABLE expenses ADD COLUMN amount_cny_settled INTEGER;
ALTER TABLE expenses ADD COLUMN settle_status TEXT NOT NULL DEFAULT 'estimated';
ALTER TABLE expenses ADD COLUMN settlement_locked INTEGER NOT NULL DEFAULT 0;
ALTER TABLE expenses ADD COLUMN entry_type TEXT NOT NULL DEFAULT 'normal';
ALTER TABLE expenses ADD COLUMN reversal_of TEXT;

UPDATE expenses SET payer_member_id = (
  SELECT lm.id FROM ledger_members lm
  WHERE lm.trip_id = expenses.trip_id AND lm.user_id = expenses.payer_id
);

UPDATE expenses SET participants = (
  SELECT json_group_array(COALESCE(lm.id, je.value))
  FROM json_each(expenses.participants) AS je
  LEFT JOIN ledger_members lm
    ON lm.trip_id = expenses.trip_id AND lm.user_id = je.value
  ORDER BY je.key
)
WHERE json_valid(participants)
  AND json_type(participants) = 'array'
  AND json_array_length(participants) > 0;

UPDATE expenses SET fx_rate_ppm = CASE currency
  WHEN 'CNY' THEN 1000000
  WHEN 'JPY' THEN 42296
  WHEN 'THB' THEN 199470
  WHEN 'KRW' THEN 5028
  WHEN 'HKD' THEN 854499
  WHEN 'TWD' THEN 209826
  WHEN 'SGD' THEN 5235740
  WHEN 'MYR' THEN 1642241
  WHEN 'VND' THEN 259
  WHEN 'IDR' THEN 374
  WHEN 'PHP' THEN 106803
  WHEN 'NZD' THEN 3749010
  WHEN 'AUD' THEN 4668162
  WHEN 'USD' THEN 6705820
  WHEN 'EUR' THEN 7491231
  WHEN 'GBP' THEN 8862922
  WHEN 'CAD' THEN 4698015
  WHEN 'CHF' THEN 8040465
  WHEN 'AED' THEN 1825955
  WHEN 'INR' THEN 69920
  ELSE 1000000
END
WHERE fx_rate_ppm IS NULL;

UPDATE expenses SET amount_cny_estimated = CAST(ROUND(amount * fx_rate_ppm / 1000000.0) AS INTEGER)
WHERE amount_cny_estimated IS NULL AND fx_rate_ppm IS NOT NULL;

UPDATE expenses SET
  amount_cny_settled = CASE WHEN currency = 'CNY' THEN amount ELSE NULL END,
  settle_status = CASE WHEN currency = 'CNY' THEN 'settled' ELSE 'estimated' END,
  settlement_locked = 0;
