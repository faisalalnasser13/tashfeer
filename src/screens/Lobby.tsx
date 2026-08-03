import { useEffect, useState } from "react";
import { api, errText } from "../lib/firebase";
import type { Room, TeamId } from "../lib/types";
import { TEAMS } from "../lib/types";
import { Banner, Btn, TEAM_HEX, TEAM_LABEL } from "../components/ui";

const MAX_SEATS = 4;
const BRASS = "#D3B45F";

export function Lobby({ room, uid, onLeave }: { room: Room; uid: string; onLeave: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const isHost = room.hostUid === uid;
  const me = room.players[uid];

  // Drop abandoned encrypt drafts for this room (incl. rematch → round 1).
  useEffect(() => {
    const prefix = `tashfeer.encryptClues.${room.id}.`;
    try {
      const doomed: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(prefix)) doomed.push(k);
      }
      for (const k of doomed) localStorage.removeItem(k);
    } catch { /* private mode */ }
  }, [room.id]);

  const byTeam = (t: TeamId | null) =>
    Object.entries(room.players)
      .filter(([, p]) => p.team === t)
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

  const gold = byTeam("gold");
  const silver = byTeam("silver");
  const idle = byTeam(null);
  const canStart = gold.length >= 2 && silver.length >= 2;
  const readyReason = readinessReason(gold.length, silver.length, idle.length);

  async function guard(fn: () => Promise<unknown>) {
    setErr(""); setBusy(true);
    try { await fn(); } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  async function share() {
    const url = `${location.origin}/?r=${room.id}`;
    const text = `انضم إلى غرفتي في تشفير\nالرمز: ${room.id}\n${url}`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "تشفير", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      try {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      } catch { /* no clipboard / user dismissed */ }
    }
  }

  function leave() {
    if (!window.confirm("مغادرة الغرفة؟ إن كنت آخر لاعب تُحذف الغرفة.")) return;
    void api.leaveRoom({ roomId: room.id }).finally(onLeave);
  }

  return (
    <div className="min-h-full pb-8" style={{ paddingTop: "calc(var(--safe-t) + 20px)" }}>
      <div className="px-4">
        {/* Room code header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="lobby-tt text-[10px] text-muted mb-1">رمز الغرفة</p>
            <p className="font-display text-[34px] leading-none text-gold tracking-[0.18em]" dir="ltr">
              {room.id}
            </p>
          </div>
          <Btn variant="ghost" className="!py-2.5 !px-4 !text-[13px] !rounded-none mt-4" onClick={share}>
            {copied ? "نُسخ الرابط" : "مشاركة"}
          </Btn>
        </div>

        {err && <div className="mb-3"><Banner tone="warn">{err}</Banner></div>}

        {/* Assignment board */}
        <section className="lobby-board mb-3">
          <div className="lobby-stations">
            {TEAMS.map((t) => {
              const list = t === "gold" ? gold : silver;
              const mine = me?.team === t;
              const otherJoined = me?.team != null && me.team !== t;
              return (
                <Station
                  key={t}
                  team={t}
                  list={list}
                  mine={mine}
                  dimEmblem={otherJoined}
                  isHost={isHost}
                  showCount={isHost}
                  hostUid={room.hostUid}
                  uid={uid}
                  busy={busy}
                  onJoin={() => {
                    if (busy) return;
                    guard(() => api.setTeam({ roomId: room.id, team: mine ? null : t }));
                  }}
                  onKick={(u) => {
                    if (busy) return;
                    guard(() => api.kickPlayer({ roomId: room.id, uid: u }));
                  }}
                />
              );
            })}
          </div>
        </section>

        {idle.length > 0 && (
          <div className="lobby-idle mb-3">
            <p className="lobby-tt text-muted mb-2">بلا فريق</p>
            <div className="flex flex-wrap gap-x-3 gap-y-2">
              {idle.map(([u, p]) => (
                <span key={u} className="flex items-center gap-1.5">
                  <span className="text-[14px]">{p.name}</span>
                  {isHost && u !== uid && (
                    <button
                      type="button"
                      className="lobby-kick"
                      onClick={() => guard(() => api.kickPlayer({ roomId: room.id, uid: u }))}
                    >
                      إخراج
                    </button>
                  )}
                </span>
              ))}
            </div>
          </div>
        )}

        {isHost && (
          <button
            type="button"
            disabled={busy || Object.keys(room.players).length < 2}
            onClick={() => guard(() => api.shuffleTeams({ roomId: room.id }))}
            className="lobby-mix mb-3"
          >
            اخلط الفرق
          </button>
        )}

        {isHost ? (
          <OrdersPanel
            room={room}
            busy={busy}
            canStart={canStart}
            readyReason={readyReason}
            onSave={(s) => guard(() => api.updateSettings({ roomId: room.id, settings: s }))}
            onStart={() => guard(() => api.startGame({ roomId: room.id }))}
          />
        ) : (
          <NonHostWait room={room} canStart={canStart} />
        )}

        <button type="button" className="w-full text-[12px] text-muted/70 pt-4 pb-2" onClick={leave}>
          مغادرة الغرفة
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* readiness                                                          */
/* ------------------------------------------------------------------ */

function readinessReason(goldN: number, silverN: number, idleN: number): string | null {
  if (goldN >= 2 && silverN >= 2 && idleN === 0) return null;
  if (goldN >= 2 && silverN >= 2 && idleN > 0) {
    return idleN === 1
      ? "لا يزال لاعب بلا فريق"
      : `${idleN} لاعبون بلا فريق`;
  }
  const short: string[] = [];
  if (goldN < 2) short.push(`الحلفاء (${goldN}/2)`);
  if (silverN < 2) short.push(`المحور (${silverN}/2)`);
  if (short.length === 2) return `${short[0]} و${short[1]} ناقصان`;
  return `${short[0]} يحتاج لاعبَين على الأقل`;
}

function ReadinessLine({ ready, reason }: { ready: boolean; reason: string | null }) {
  return (
    <div className={`lobby-ready ${ready ? "lobby-ready-ok" : "lobby-ready-warn"}`}>
      {ready ? (
        <>
          <ReadyIcon ok />
          <span>الجاهزية مكتملة — يمكن البدء</span>
        </>
      ) : (
        <>
          <ReadyIcon ok={false} />
          <span>{reason ?? "بانتظار اكتمال الفريقين"}</span>
        </>
      )}
    </div>
  );
}

function ReadyIcon({ ok }: { ok: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden className="shrink-0">
      {ok ? (
        <path
          d="M2.5 7.2 5.6 10.2 11.5 3.8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ) : (
        <>
          <path d="M7 2.2 12.2 11.5H1.8Z" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
          <path d="M7 5.5v2.8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="7" cy="10.2" r="0.7" fill="currentColor" />
        </>
      )}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* station board                                                      */
/* ------------------------------------------------------------------ */

function Station({
  team, list, mine, dimEmblem, isHost, showCount, hostUid, uid, busy, onJoin, onKick,
}: {
  team: TeamId;
  list: [string, Room["players"][string]][];
  mine: boolean;
  dimEmblem: boolean;
  isHost: boolean;
  showCount: boolean;
  hostUid: string;
  uid: string;
  busy: boolean;
  onJoin: () => void;
  onKick: (u: string) => void;
}) {
  const empty = Math.max(0, MAX_SEATS - list.length);
  const color = TEAM_HEX[team];

  return (
    <div
      role="button"
      tabIndex={busy ? -1 : 0}
      data-team={team}
      className={`lobby-station ${mine ? "lobby-station-mine" : ""} ${busy ? "lobby-station-busy" : ""}`}
      onClick={() => {
        if (!busy) onJoin();
      }}
      onKeyDown={(e) => {
        if (busy) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onJoin();
        }
      }}
    >
      <div className="lobby-station-top">
        <span className={`lobby-emblem-wrap ${dimEmblem ? "lobby-emblem-dim" : ""}`}>
          <TeamEmblem team={team} size={28} />
        </span>
        <span
          className={`font-display text-[14px] leading-none truncate ${dimEmblem ? "lobby-emblem-dim" : ""}`}
          style={{ color }}
        >
          {TEAM_LABEL[team]}
        </span>
        {showCount && (
          <span className="num text-[11px] text-muted ms-auto shrink-0">
            {list.length}/{MAX_SEATS}
          </span>
        )}
      </div>

      <div className="lobby-station-body">
        {list.map(([u, p]) => (
          <div key={u} className="lobby-seat">
            <span className="truncate text-[13.5px]">{p.name}</span>
            <span className="flex items-center gap-1.5 shrink-0">
              {u === hostUid && <span className="lobby-tt text-[9px] text-muted">مضيف</span>}
              {isHost && u !== uid && (
                <button
                  type="button"
                  className="lobby-kick"
                  onClick={(e) => {
                    e.stopPropagation();
                    onKick(u);
                  }}
                >
                  إخراج
                </button>
              )}
            </span>
          </div>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e-${i}`} className="lobby-seat lobby-seat-empty">
            <span className="text-muted">—</span>
            <span className="lobby-seat-dots" />
          </div>
        ))}
      </div>

      <div
        className="lobby-station-action"
        style={{ color: mine ? color : "#8A8474" }}
      >
        {mine ? "خروج" : "انضم"}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* emblems                                                            */
/* ------------------------------------------------------------------ */

function TeamEmblem({ team, size }: { team: TeamId; size: number }) {
  const small = size < 24;
  const field = team === "gold" ? "#1E3A5F" : "#5C2E12";
  const accent = TEAM_HEX[team];
  const stroke = small ? 3.4 : 2.9;
  const pipR = small ? 2.4 : 1.7;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 62 62"
      aria-hidden
      className="block"
    >
      <path
        d="M31 3L57 12v22c0 14-10.5 23-26 27C15.5 57 5 48 5 34V12z"
        fill={field}
        stroke={BRASS}
        strokeWidth={stroke}
        strokeLinejoin="round"
      />
      {!small && (
        <path
          d="M31 8.5L52 16v17.5c0 11.5-8.5 19-21 22.5C18.5 52.5 10 45 10 33.5V16z"
          fill="none"
          stroke={accent}
          strokeOpacity={0.85}
          strokeWidth={1.45}
          strokeLinejoin="round"
        />
      )}
      {team === "gold" ? (
        <path
          d="M31 18.5l2.9 8.4h8.8l-7.1 5.2 2.7 8.4L31 35.4l-7.3 5.1 2.7-8.4-7.1-5.2h8.8z"
          fill="#EDE4CE"
        />
      ) : (
        <path d="M31 19.5L42 38.5H20z" fill="#EDE4CE" />
      )}
      <circle cx="22" cy="46" r={pipR} fill={BRASS} />
      <circle cx="31" cy="46" r={pipR} fill={BRASS} />
      <circle cx="40" cy="46" r={pipR} fill={BRASS} />
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* orders (host)                                                      */
/* ------------------------------------------------------------------ */

function OrdersPanel({
  room, busy, canStart, readyReason, onSave, onStart,
}: {
  room: Room;
  busy: boolean;
  canStart: boolean;
  readyReason: string | null;
  onSave: (s: Partial<Room["settings"]>) => void;
  onStart: () => void;
}) {
  const s = room.settings;
  const timerOpts = [45, 60, 75] as const;

  return (
    <section className="lobby-orders mt-3">
      <header className="lobby-orders-head">
        <span>أوامر التشغيل</span>
        <span className="text-muted">المضيف فقط</span>
      </header>

      <div className="lobby-orders-row">
        <span className="text-[13.5px]">المؤقت</span>
        <TimerLever
          on={s.useTimer}
          onToggle={() => onSave({ useTimer: !s.useTimer })}
        />
      </div>

      <div className={`lobby-orders-row lobby-orders-stack ${s.useTimer ? "" : "lobby-orders-dim"}`}>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px]">وقت كتابة التلميحات</span>
          <span className="num text-[13px]" style={{ color: BRASS }}>
            {s.encryptSecs}
            <span className="text-[10px] text-muted ms-1">ث</span>
          </span>
        </div>
        <Segmented
          options={timerOpts}
          value={s.encryptSecs}
          disabled={!s.useTimer}
          onChange={(v) => onSave({ encryptSecs: v })}
        />
      </div>

      <div className={`lobby-orders-row lobby-orders-stack ${s.useTimer ? "" : "lobby-orders-dim"}`}>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px]">وقت الفكّ والاعتراض</span>
          <span className="num text-[13px]" style={{ color: BRASS }}>
            {s.guessSecs}
            <span className="text-[10px] text-muted ms-1">ث</span>
          </span>
        </div>
        <Segmented
          options={timerOpts}
          value={s.guessSecs}
          disabled={!s.useTimer}
          onChange={(v) => onSave({ guessSecs: v })}
        />
      </div>

      <div className="lobby-orders-row lobby-orders-stack">
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px]">عدد الجولات</span>
        </div>
        <Segmented
          options={[6, 8, 10] as const}
          value={s.maxRounds}
          onChange={(v) => onSave({ maxRounds: v })}
        />
      </div>

      <div className="lobby-orders-ready">
        <ReadinessLine ready={canStart} reason={readyReason} />
      </div>

      <button
        type="button"
        disabled={!canStart || busy}
        onClick={onStart}
        className="lobby-orders-start"
      >
        ابدأ اللعبة
      </button>
    </section>
  );
}

function TimerLever({ on, onToggle }: { on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? "تشغيل المؤقت" : "إيقاف المؤقت"}
      onClick={onToggle}
      className={`lobby-lever ${on ? "lobby-lever-on" : ""}`}
    >
      <span className="lobby-lever-label lobby-lever-on-label">تشغيل</span>
      <span className="lobby-lever-label lobby-lever-off-label">إيقاف</span>
      <i className="lobby-lever-bolt" aria-hidden />
    </button>
  );
}

function Segmented<T extends number>({
  options, value, onChange, disabled,
}: {
  options: readonly T[];
  value: number;
  onChange: (v: T) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`lobby-seg ${disabled ? "pointer-events-none" : ""}`}>
      {options.map((v) => (
        <button
          key={v}
          type="button"
          disabled={disabled}
          onClick={() => onChange(v)}
          className={`lobby-seg-btn num ${value === v ? "lobby-seg-on" : ""}`}
        >
          {v}
        </button>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* non-host                                                           */
/* ------------------------------------------------------------------ */

function NonHostWait({ room, canStart }: { room: Room; canStart: boolean }) {
  const s = room.settings;
  return (
    <div className="lobby-wait mt-3">
      <p className="lobby-wait-line">
        <span className="lobby-wait-dots" aria-hidden>
          <i /><i /><i />
        </span>
        {canStart ? "بانتظار المضيف ليبدأ…" : "بانتظار اكتمال الفريقين…"}
      </p>
      <table className="lobby-summary">
        <tbody>
          <tr>
            <th>المؤقت</th>
            <td>{s.useTimer ? "تشغيل" : "إيقاف"}</td>
          </tr>
          <tr>
            <th>كتابة التلميحات</th>
            <td className="num">{s.encryptSecs} ث</td>
          </tr>
          <tr>
            <th>الفكّ والاعتراض</th>
            <td className="num">{s.guessSecs} ث</td>
          </tr>
          <tr>
            <th>عدد الجولات</th>
            <td className="num">{s.maxRounds}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
