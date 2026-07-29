import { useState } from "react";
import { api, errText } from "../lib/firebase";
import type { Room, TeamId } from "../lib/types";
import { TEAMS } from "../lib/types";
import { Banner, Btn, TEAM_HEX, TEAM_LABEL } from "../components/ui";

export function Lobby({ room, uid, onLeave }: { room: Room; uid: string; onLeave: () => void }) {
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const isHost = room.hostUid === uid;
  const me = room.players[uid];

  const byTeam = (t: TeamId | null) =>
    Object.entries(room.players)
      .filter(([, p]) => p.team === t)
      .sort((a, b) => a[1].joinedAt - b[1].joinedAt);

  const gold = byTeam("gold");
  const silver = byTeam("silver");
  const idle = byTeam(null);
  const canStart = gold.length >= 2 && silver.length >= 2;

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

  return (
    <div className="min-h-full pb-32" style={{ paddingTop: "calc(var(--safe-t) + 20px)" }}>
      <div className="px-5">
        <div className="flex items-start justify-between gap-3 mb-5">
          <div>
            <p className="text-[11px] text-muted mb-1">رمز الغرفة</p>
            <p className="font-display text-[34px] leading-none text-gold tracking-[0.18em]" dir="ltr">
              {room.id}
            </p>
          </div>
          <Btn variant="ghost" className="!py-2.5 !px-4 !text-[13px] mt-4" onClick={share}>
            {copied ? "نُسخ الرابط" : "مشاركة"}
          </Btn>
        </div>

        {err && <div className="mb-4"><Banner tone="warn">{err}</Banner></div>}

        <div className="grid grid-cols-2 gap-2.5 mb-3">
          {TEAMS.map((t) => {
            const list = t === "gold" ? gold : silver;
            const mine = me?.team === t;
            return (
              <div
                key={t}
                role="button"
                tabIndex={0}
                onClick={() => {
                  if (busy) return;
                  guard(() => api.setTeam({ roomId: room.id, team: mine ? null : t }));
                }}
                onKeyDown={(e) => {
                  if (busy) return;
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    guard(() => api.setTeam({ roomId: room.id, team: mine ? null : t }));
                  }
                }}
                className={`card p-3 text-start min-h-[8.5rem] flex flex-col transition cursor-pointer ${
                  t === "gold" ? "card-gold" : "card-silver"
                }`}
                style={{ opacity: mine ? 1 : 0.82, boxShadow: mine ? `inset 0 0 0 1px ${TEAM_HEX[t]}` : undefined }}
              >
                <div className="flex items-baseline justify-between mb-2.5">
                  <span className="font-display text-[16px]" style={{ color: TEAM_HEX[t] }}>
                    {TEAM_LABEL[t]}
                  </span>
                  <span className="num text-[11px] text-muted">
                    {list.length}/{4}
                  </span>
                </div>
                <div className="space-y-2 flex-1">
                  {list.map(([u, p]) => (
                    <div key={u} className="flex items-center justify-between gap-1">
                      <span className="truncate text-[14px]">{p.name}</span>
                      <span className="flex items-center gap-1 shrink-0">
                        {u === room.hostUid && (
                          <span className="text-[10px] text-muted">مضيف</span>
                        )}
                        {isHost && u !== uid && (
                          <button
                            type="button"
                            className="text-[11px] text-alarm/80 px-1"
                            onClick={(e) => {
                              e.stopPropagation();
                              guard(() => api.kickPlayer({ roomId: room.id, uid: u }));
                            }}
                          >
                            إخراج
                          </button>
                        )}
                      </span>
                    </div>
                  ))}
                  {list.length < 2 && (
                    <p className="text-[11.5px] text-muted">يلزم لاعبان على الأقل</p>
                  )}
                </div>
                <span className="text-[11px] mt-2" style={{ color: mine ? TEAM_HEX[t] : "#8794B8" }}>
                  {mine ? "أنت هنا · اضغط للخروج" : "انضم"}
                </span>
              </div>
            );
          })}
        </div>

        {idle.length > 0 && (
          <div className="card p-3 mb-4">
            <p className="text-[11px] text-muted mb-2">بلا فريق</p>
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {idle.map(([u, p]) => (
                <span key={u} className="flex items-center gap-1.5">
                  <span className="text-[14px]">{p.name}</span>
                  {isHost && u !== uid && (
                    <button
                      className="text-[11px] text-alarm/80 px-1"
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

        {isHost ? (
          <>
            <button
              disabled={busy || Object.keys(room.players).length < 2}
              onClick={() => guard(() => api.shuffleTeams({ roomId: room.id }))}
              className="w-full card px-4 py-3 mb-3 flex items-center justify-between
                         disabled:opacity-40 active:scale-[.99] transition"
            >
              <span className="text-[13.5px]">توزيع الفرق عشوائيًا</span>
              <span className="text-[11.5px] text-gold">اخلط</span>
            </button>
            <Settings room={room} onSave={(s) => guard(() => api.updateSettings({ roomId: room.id, settings: s }))} />
          </>
        ) : (
          <Banner>المضيف يضبط المؤقتات ويبدأ اللعبة.</Banner>
        )}
      </div>

      <div
        className="fixed inset-x-0 bottom-0 bg-ink/95 backdrop-blur-sm border-t border-line px-5 pt-3"
        style={{ paddingBottom: "calc(var(--safe-b) + 12px)" }}
      >
        {isHost ? (
          <>
            <Btn
              className="w-full"
              disabled={!canStart || busy}
              onClick={() => guard(() => api.startGame({ roomId: room.id }))}
            >
              ابدأ اللعبة
            </Btn>
            {!canStart && (
              <p className="text-center text-[11.5px] text-muted mt-2">
                تحتاج لاعبَين على الأقل في كل فريق
              </p>
            )}
          </>
        ) : (
          <p className="text-center text-[13px] text-muted py-3">
            {canStart ? "بانتظار المضيف ليبدأ…" : "بانتظار اكتمال الفريقين…"}
          </p>
        )}
        <button
          className="w-full text-[12px] text-muted/70 pt-3"
          onClick={() => api.leaveRoom({ roomId: room.id }).finally(onLeave)}
        >
          مغادرة الغرفة
        </button>
      </div>
    </div>
  );
}

function Settings({
  room, onSave,
}: { room: Room; onSave: (s: Partial<Room["settings"]>) => void }) {
  const s = room.settings;
  const timerOpts = [45, 60, 75] as const;

  return (
    <div className="card px-4 py-3 space-y-1">
      <TimerPick
        label="وقت كتابة التلميحات"
        value={s.encryptSecs}
        options={timerOpts}
        disabled={!s.useTimer}
        onChange={(v) => onSave({ encryptSecs: v })}
      />
      <TimerPick
        label="وقت الفكّ والاعتراض"
        value={s.guessSecs}
        options={timerOpts}
        disabled={!s.useTimer}
        onChange={(v) => onSave({ guessSecs: v })}
      />

      <div className="flex items-center justify-between gap-3 pt-3 mt-2 border-t border-line">
        <span className="text-[13.5px]">المؤقت</span>
        <button
          role="switch"
          aria-checked={s.useTimer}
          onClick={() => onSave({ useTimer: !s.useTimer })}
          className="relative w-12 h-7 rounded-full transition shrink-0"
          style={{
            background: s.useTimer ? "#D9A44133" : "#0C1330",
            boxShadow: `inset 0 0 0 1px ${s.useTimer ? "#D9A441" : "#25335F"}`,
          }}
        >
          <span
            className="absolute top-1 w-5 h-5 rounded-full transition-all"
            style={{
              insetInlineStart: s.useTimer ? "4px" : "24px",
              background: s.useTimer ? "#D9A441" : "#4A5680",
            }}
          />
        </button>
      </div>

      <div className="flex items-center justify-between gap-3 py-2.5">
        <span className="text-[13.5px]">عدد الجولات</span>
        <div className="flex gap-1.5 shrink-0">
          {[6, 8, 10].map((v) => (
            <button
              key={v}
              onClick={() => onSave({ maxRounds: v })}
              className="num rounded-lg px-3.5 py-1.5 text-[13px] border transition"
              style={{
                borderColor: s.maxRounds === v ? "#D9A441" : "#25335F",
                background: s.maxRounds === v ? "#D9A44118" : "transparent",
                color: s.maxRounds === v ? "#D9A441" : "#8794B8",
              }}
            >
              {v}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function TimerPick({
  label, value, options, onChange, disabled,
}: {
  label: string;
  value: number;
  options: readonly number[];
  onChange: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className={`py-2.5 ${disabled ? "opacity-40" : ""}`}>
      <div className="flex items-baseline justify-between mb-2.5">
        <span className="text-[13.5px]">{label}</span>
        <span className="num font-display text-[15px] text-gold">
          {value}
          <span className="text-[11px] text-muted ms-1">ثانية</span>
        </span>
      </div>
      <div className="flex gap-1.5">
        {options.map((v) => (
          <button
            key={v}
            disabled={disabled}
            onClick={() => onChange(v)}
            className="num flex-1 rounded-lg py-2 text-[13px] border transition disabled:pointer-events-none"
            style={{
              borderColor: value === v ? "#D9A441" : "#25335F",
              background: value === v ? "#D9A44118" : "transparent",
              color: value === v ? "#D9A441" : "#8794B8",
            }}
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
