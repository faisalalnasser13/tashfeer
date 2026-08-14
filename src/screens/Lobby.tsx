import { useEffect, useState } from "react";
import { api, errText } from "../lib/firebase";
import type { Room, TeamId } from "../lib/types";
import { TEAMS } from "../lib/types";
import { TeamEmblem } from "../components/TeamEmblem";
import { Banner, Btn, TEAM_HEX } from "../components/ui";
import { QR } from "../components/QR";
import { S, joinUrl } from "../lib/strings";

const MAX_SEATS = 4;
const BRASS = "#D3B45F";

export function Lobby({ room, uid, onLeave }: { room: Room; uid: string; onLeave: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showQr, setShowQr] = useState(false);
  const isHost = room.hostUid === uid;
  const me = room.players[uid];
  const s = S(room.lang);
  const url = joinUrl(room.id);

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
  const readyReason = readinessReason(gold.length, silver.length, idle.length, s);

  async function guard(fn: () => Promise<unknown>) {
    setErr(""); setBusy(true);
    try { await fn(); } catch (e) { setErr(errText(e, room.lang)); } finally { setBusy(false); }
  }

  async function share() {
    const text = s.shareText(room.id, url);
    try {
      if (navigator.share) {
        await navigator.share({ title: s.title, text, url });
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
    if (!window.confirm(s.leaveConfirm)) return;
    void api.leaveRoom({ roomId: room.id }).finally(onLeave);
  }

  return (
    <div className="min-h-full pb-8" style={{ paddingTop: "calc(var(--safe-t) + 20px)" }}>
      <div className="px-4">
        {/* Room code header */}
        <div className="flex items-start justify-between gap-3 mb-4">
          <div>
            <p className="lobby-tt text-[10px] text-muted mb-1">{s.roomCode}</p>
            <p className="font-display text-[34px] leading-none text-gold tracking-[0.18em]" dir="ltr">
              {room.id}
            </p>
          </div>
          <Btn variant="ghost" className="!py-2.5 !px-4 !text-[13px] !rounded-none mt-4" onClick={share}>
            {copied ? s.copied : s.share}
          </Btn>
        </div>

        {err && <div className="mb-3"><Banner tone="warn">{err}</Banner></div>}

        <Btn variant="ghost" className="w-full !py-2.5 mb-3" onClick={() => setShowQr((v) => !v)}>
          {showQr ? s.hideQr : s.showQr}
        </Btn>
        {showQr && (
          <div className="mb-3 flex flex-col items-center gap-1.5">
            <QR url={url} />
            <span className="text-[11px] font-bold text-muted">{s.scanToJoin}</span>
          </div>
        )}

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
                  copy={s}
                />
              );
            })}
          </div>
        </section>

        {idle.length > 0 && (
          <div className="lobby-idle mb-3">
            <p className="lobby-tt text-muted mb-2">{s.noTeam}</p>
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
                      {s.kick}
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
            {s.shuffle}
          </button>
        )}

        {isHost ? (
          <OrdersPanel
            room={room}
            busy={busy}
            canStart={canStart}
            readyReason={readyReason}
            onSave={(st) => guard(() => api.updateSettings({ roomId: room.id, settings: st }))}
            onStart={() => guard(() => api.startGame({ roomId: room.id }))}
          />
        ) : (
          <NonHostWait room={room} canStart={canStart} />
        )}

        <button type="button" className="w-full text-[12px] text-muted/70 pt-4 pb-2" onClick={leave}>
          {s.leave}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* readiness                                                          */
/* ------------------------------------------------------------------ */

function readinessReason(
  goldN: number, silverN: number, idleN: number, s: ReturnType<typeof S>,
): string | null {
  if (goldN >= 2 && silverN >= 2 && idleN === 0) return null;
  if (goldN >= 2 && silverN >= 2 && idleN > 0) {
    return idleN === 1 ? s.idleOne : s.idleMany(idleN);
  }
  const short: string[] = [];
  if (goldN < 2) short.push(s.goldShort(goldN));
  if (silverN < 2) short.push(s.silverShort(silverN));
  if (short.length === 2) return s.shortBoth(short[0], short[1]);
  return s.needsTwo(short[0]);
}

function ReadinessLine({ ready, reason, okLabel }: { ready: boolean; reason: string | null; okLabel: string }) {
  return (
    <div className={`lobby-ready ${ready ? "lobby-ready-ok" : "lobby-ready-warn"}`}>
      {ready ? (
        <>
          <ReadyIcon ok />
          <span>{okLabel}</span>
        </>
      ) : (
        <>
          <ReadyIcon ok={false} />
          <span>{reason ?? ""}</span>
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
  team, list, mine, dimEmblem, isHost, showCount, hostUid, uid, busy, onJoin, onKick, copy,
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
  copy: ReturnType<typeof S>;
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
          {copy.team[team]}
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
              {u === hostUid && <span className="lobby-tt text-[9px] text-muted">{copy.host}</span>}
              {isHost && u !== uid && (
                <button
                  type="button"
                  className="lobby-kick"
                  onClick={(e) => {
                    e.stopPropagation();
                    onKick(u);
                  }}
                >
                  {copy.kick}
                </button>
              )}
            </span>
          </div>
        ))}
        {Array.from({ length: empty }, (_, i) => (
          <div key={`e-${i}`} className="lobby-seat lobby-seat-empty">
            <span className="text-muted">{copy.empty}</span>
            <span className="lobby-seat-dots" />
          </div>
        ))}
      </div>

      <div
        className="lobby-station-action"
        style={{ color: mine ? color : "#8A8474" }}
      >
        {mine ? copy.leaveSide : copy.joinSide}
      </div>
    </div>
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
  const copy = S(room.lang);
  const timerOpts = [45, 60, 75] as const;

  return (
    <section className="lobby-orders mt-3">
      <header className="lobby-orders-head">
        <span>{copy.orders}</span>
        <span className="text-muted">{copy.hostOnly}</span>
      </header>

      <div className="lobby-orders-row">
        <span className="text-[13.5px]">{copy.timer}</span>
        <TimerLever
          on={s.useTimer}
          onToggle={() => onSave({ useTimer: !s.useTimer })}
          onLabel={copy.timerOn}
          offLabel={copy.timerOff}
        />
      </div>

      <div className={`lobby-orders-row lobby-orders-stack ${s.useTimer ? "" : "lobby-orders-dim"}`}>
        <div className="flex items-baseline justify-between mb-2">
          <span className="text-[13px]">{copy.encryptTime}</span>
          <span className="num text-[13px]" style={{ color: BRASS }}>
            {s.encryptSecs}
            <span className="text-[10px] text-muted ms-1">{copy.sec}</span>
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
          <span className="text-[13px]">{copy.guessTime}</span>
          <span className="num text-[13px]" style={{ color: BRASS }}>
            {s.guessSecs}
            <span className="text-[10px] text-muted ms-1">{copy.sec}</span>
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
          <span className="text-[13px]">{copy.rounds}</span>
        </div>
        <Segmented
          options={[6, 8, 10] as const}
          value={s.maxRounds}
          onChange={(v) => onSave({ maxRounds: v })}
        />
      </div>

      <div className="lobby-orders-ready">
        <ReadinessLine ready={canStart} reason={readyReason} okLabel={copy.readyOk} />
      </div>

      <button
        type="button"
        disabled={!canStart || busy}
        onClick={onStart}
        className="lobby-orders-start"
      >
        {copy.start}
      </button>
    </section>
  );
}

function TimerLever({
  on, onToggle, onLabel, offLabel,
}: {
  on: boolean; onToggle: () => void; onLabel: string; offLabel: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? onLabel : offLabel}
      onClick={onToggle}
      className={`lobby-lever ${on ? "lobby-lever-on" : ""}`}
    >
      <span className="lobby-lever-label lobby-lever-on-label">{onLabel}</span>
      <span className="lobby-lever-label lobby-lever-off-label">{offLabel}</span>
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
  const copy = S(room.lang);
  return (
    <div className="lobby-wait mt-3">
      <p className="lobby-wait-line">
        <span className="lobby-wait-dots" aria-hidden>
          <i /><i /><i />
        </span>
        {canStart ? copy.waitingHost : copy.waitingTeams}
      </p>
      <table className="lobby-summary">
        <tbody>
          <tr>
            <th>{copy.timer}</th>
            <td>{s.useTimer ? copy.timerOn : copy.timerOff}</td>
          </tr>
          <tr>
            <th>{copy.encryptTime}</th>
            <td className="num">{s.encryptSecs} {copy.sec}</td>
          </tr>
          <tr>
            <th>{copy.guessTime}</th>
            <td className="num">{s.guessSecs} {copy.sec}</td>
          </tr>
          <tr>
            <th>{copy.rounds}</th>
            <td className="num">{s.maxRounds}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
