'use client';

import { useEffect, useRef, useState } from 'react';

import { CATEGORIES } from '@/lib/categories';
import { LIMITS } from '@/lib/moderation';
import type { CategoryId, Report } from '@/lib/types';

interface Props {
  lat: number;
  lng: number;
  onCancel: () => void;
  onCreated: (report: Report) => void;
}

export default function ReportForm({ lat, lng, onCancel, onCreated }: Props) {
  const [category, setCategory] = useState<CategoryId>('suspicious');
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [occurredAt, setOccurredAt] = useState(() => toDateInput(new Date()));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCancel();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onCancel]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch('/api/reports', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          lat,
          lng,
          category,
          title,
          body,
          // 日付のみの入力なので、その日の正午として扱う
          occurredAt: occurredAt ? new Date(`${occurredAt}T12:00:00`).toISOString() : undefined,
        }),
      });
      const data = (await res.json()) as { report?: Report; error?: string };
      if (!res.ok || !data.report) {
        setError(data.error ?? '投稿に失敗しました。');
        return;
      }
      onCreated(data.report);
    } catch {
      setError('通信に失敗しました。時間をおいて再度お試しください。');
    } finally {
      setSubmitting(false);
    }
  }

  const selected = CATEGORIES.find((c) => c.id === category);

  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="治安情報を投稿">
        <h2>治安情報を投稿</h2>
        <p className="muted">
          位置: {lat.toFixed(5)}, {lng.toFixed(5)}
        </p>

        <div className="notice" style={{ marginTop: 10 }}>
          個人名・住所・電話番号・車のナンバーなど、個人が特定できる情報は書き込まないでください。
          投稿はすぐに公開され、取り消しはできません。
        </div>

        <form onSubmit={submit}>
          <div className="field">
            <span>カテゴリ</span>
            <div className="category-grid">
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="category-option"
                  aria-pressed={category === c.id}
                  onClick={() => setCategory(c.id)}
                >
                  <span className="dot" style={{ background: c.color }} />
                  {c.emoji} {c.label}
                </button>
              ))}
            </div>
            {selected && <p className="field-hint">例: {selected.hint}</p>}
          </div>

          <label className="field">
            <span>何があったか（{LIMITS.MIN_TITLE}〜{LIMITS.MAX_TITLE}文字）</span>
            <input
              ref={titleRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={LIMITS.MAX_TITLE}
              placeholder="例: 深夜に不審な声かけがあった"
              required
            />
          </label>

          <label className="field">
            <span>詳細（任意・{LIMITS.MAX_BODY}文字まで）</span>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              maxLength={LIMITS.MAX_BODY}
              placeholder="時間帯、状況、注意したほうがよいことなど"
            />
            <p className="field-hint">{body.length} / {LIMITS.MAX_BODY}</p>
          </label>

          <label className="field">
            <span>発生日</span>
            <input
              type="date"
              value={occurredAt}
              max={toDateInput(new Date())}
              onChange={(e) => setOccurredAt(e.target.value)}
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <div className="modal-actions">
            <button type="button" className="btn" onClick={onCancel} disabled={submitting}>
              キャンセル
            </button>
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? '送信中…' : 'この内容で投稿'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function toDateInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
