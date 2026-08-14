-- 投稿データのスキーマ。
-- アプリは起動時に同じ内容を CREATE TABLE IF NOT EXISTS で流すので、
-- 通常このファイルを手で実行する必要はない。
-- 中身を確認したいときや、マイグレーションツールに載せ替えるときの参照用。

CREATE TABLE IF NOT EXISTS reports (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lat           double precision NOT NULL,
  lng           double precision NOT NULL,
  category      text NOT NULL,
  title         text NOT NULL,
  body          text NOT NULL DEFAULT '',
  occurred_at   timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  flag_count    integer NOT NULL DEFAULT 0,
  hidden        boolean NOT NULL DEFAULT false,
  -- 生の IP ではなく、ソルト付きハッシュ。レート制限にのみ使う。
  ip_hash       text
);

CREATE INDEX IF NOT EXISTS reports_latlng_idx ON reports (lat, lng);
CREATE INDEX IF NOT EXISTS reports_occurred_idx ON reports (occurred_at DESC);
CREATE INDEX IF NOT EXISTS reports_ip_recent_idx ON reports (ip_hash, created_at DESC);

-- 同一利用者による二重通報を防ぐため、通報は主キーで一意にする。
CREATE TABLE IF NOT EXISTS report_flags (
  report_id  uuid NOT NULL REFERENCES reports(id) ON DELETE CASCADE,
  ip_hash    text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (report_id, ip_hash)
);

-- 通報が集まって非表示になった投稿を確認する
--   SELECT id, title, flag_count, created_at FROM reports WHERE hidden ORDER BY created_at DESC;

-- 誤って非表示になった投稿を戻す
--   UPDATE reports SET hidden = false, flag_count = 0 WHERE id = '...';
--   DELETE FROM report_flags WHERE report_id = '...';
