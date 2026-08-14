/**
 * 投稿の簡易チェック。
 *
 * 目的は「明らかに投稿してはいけないもの」を機械的に止めることであって、
 * 内容の真偽を判定することではない。取りこぼしは通報 (flag) 機能で拾う前提。
 */

export interface ModerationResult {
  ok: boolean;
  /** ok=false のときに利用者へ返す説明。 */
  reason?: string;
}

/**
 * 個人が特定される情報。治安情報サイトでは特定の個人を名指しする投稿が
 * いちばん危険なので、連絡先の類いは形式で弾く。
 */
const PERSONAL_INFO_PATTERNS: Array<{ re: RegExp; label: string }> = [
  { re: /0\d{1,4}[-(\s]?\d{1,4}[-)\s]?\d{3,4}/, label: '電話番号' },
  { re: /[\w.+-]+@[\w-]+\.[\w.-]+/, label: 'メールアドレス' },
  { re: /https?:\/\//i, label: 'URL' },
  // 「◯丁目◯番◯号」まで書かれた地番。地図上のピンで位置は示せるので本文には不要。
  { re: /[0-9０-９一二三四五六七八九十]+\s*(丁目)[^。\n]{0,12}[0-9０-９]+\s*号/, label: '番地' },
  { re: /(車両?|ナンバー)[^。\n]{0,6}[品川練馬足立多摩八王子][\s]?\d{2,3}/, label: '車両ナンバー' },
];

/**
 * 攻撃的・違法な内容の最低限のフィルタ。
 * 運用にあわせて data/ng-words.json 側で語を足していく想定の出発点。
 */
const ABUSE_PATTERNS: RegExp[] = [
  /(殺す|殺害する|死ね|しね)/,
  /(晒す|晒し上げ)/,
  /(在日|部落)[^。\n]{0,6}(死|出て行け|帰れ)/,
];

const MIN_TITLE = 4;
const MAX_TITLE = 60;
const MAX_BODY = 600;

export function moderateTitle(title: string): ModerationResult {
  const t = title.trim();
  if (t.length < MIN_TITLE) {
    return { ok: false, reason: `タイトルは${MIN_TITLE}文字以上で入力してください。` };
  }
  if (t.length > MAX_TITLE) {
    return { ok: false, reason: `タイトルは${MAX_TITLE}文字以内で入力してください。` };
  }
  return moderateText(t);
}

export function moderateBody(body: string): ModerationResult {
  const b = body.trim();
  if (b.length > MAX_BODY) {
    return { ok: false, reason: `詳細は${MAX_BODY}文字以内で入力してください。` };
  }
  return moderateText(b);
}

function moderateText(text: string): ModerationResult {
  if (!text) return { ok: true };

  for (const { re, label } of PERSONAL_INFO_PATTERNS) {
    if (re.test(text)) {
      return {
        ok: false,
        reason: `${label}が含まれているようです。個人が特定できる情報は書き込まないでください。`,
      };
    }
  }

  for (const re of ABUSE_PATTERNS) {
    if (re.test(text)) {
      return {
        ok: false,
        reason: '攻撃的な表現が含まれているようです。事実の記述だけを書き込んでください。',
      };
    }
  }

  // 「あああああ…」のような無意味な連投を弾く
  if (/(.)\1{9,}/.test(text)) {
    return { ok: false, reason: '同じ文字の繰り返しが多すぎます。' };
  }

  return { ok: true };
}

export const LIMITS = { MIN_TITLE, MAX_TITLE, MAX_BODY };
