import { useEffect, useMemo, useRef, useState } from "react";
import { api, errText } from "../lib/firebase";
import { normalizeAr, normalizeKey, ORDINALS } from "../lib/arabic";
import { useDraft, useLocal } from "../lib/hooks";
import type { AwayRecord, Draft, Room, RoundRecord, TeamId } from "../lib/types";
import { OTHER, TEAMS } from "../lib/types";
import { Cartouche } from "../components/Cartouche";
import { buildLanes, ClueGrid } from "../components/ClueGrid";
import { Banner, Btn, Empty, Stamp, TEAM_HEX, TEAM_LABEL } from "../components/ui";
import { codesEqual } from "../lib/rules";

interface Ctx {
  room: Room;
  uid: string;
  myTeam: TeamId;
  keys: string[] | null;
  usedClues: string[];
  theories: Record<string, string>;
  rounds: RoundRecord[];
  draft: Draft | null;
  actions: {
    setCode: (f: "decrypt" | "intercept", values: (number | null)[]) => Promise<unknown>;
    submit: (uid: string, field: "decrypt" | "intercept") => Promise<unknown>;
  } | null;
  code: number[] | null;
  /** Clues this encryptor already wrote to the secret doc (survives remount). */
  mySubmittedClues: string[] | null;
  away: AwayRecord[];
  setTheory: ((n: string, text: string) => void) | null;
}

/** Host skip for short transition beats (keys / reveal / roundEnd). */
function HostContinue({
  room, uid, label,
}: {
  room: Room; uid: string; label: string;
}) {
  if (room.hostUid !== uid) return null;
  return (
    <div
      className="fixed inset-x-0 bg-ink/95 backdrop-blur-sm border-t border-line px-4 pt-3 z-40"
      style={{
        // Sit above the tab bar (same offset as the guess dock).
        bottom: "calc(3.25rem + var(--safe-b))",
        paddingBottom: "10px",
      }}
    >
      <Btn
        className="w-full"
        onClick={() =>
          api.advancePhase({
            roomId: room.id, force: true, fromPhase: room.phase, fromRound: room.round,
          }).catch((e) => { alert(errText(e)); })
        }
      >
        {label}
      </Btn>
    </div>
  );
}

/* ================================================================== */
/* keys                                                               */
/* ================================================================== */

export function KeysPhase({ room, uid, myTeam, keys }: Ctx) {
  const isHost = room.hostUid === uid;
  const color = TEAM_HEX[myTeam];
  const other = OTHER[myTeam];
  const [busy, setBusy] = useState<TeamId | null>(null);
  const [err, setErr] = useState("");

  async function reshuffle(team: TeamId) {
    setErr("");
    setBusy(team);
    try {
      await api.shuffleTeamKeys({ roomId: room.id, team });
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={`px-5 py-6 fade-in ${isHost ? "pb-36" : "pb-28"}`}>
      <h2 className="text-[22px] font-semibold text-center mb-1.5">مفاتيحكم الأربعة</h2>
      <p className="text-[15px] text-muted text-center mb-5 leading-relaxed">
        {isHost
          ? "راجعوا كلمات فريقكم. خلط فريق الخصم بموافقتهم — بدون عرض كلماتهم."
          : "لن تتغيّر طوال اللعبة. انتظروا المضيف للمتابعة."}
      </p>
      {err && (
        <div className="mb-4 max-w-sm mx-auto">
          <Banner tone="warn">{err}</Banner>
        </div>
      )}
      <div className="space-y-2 max-w-sm mx-auto">
        {(keys ?? ["", "", "", ""]).map((k, i) => (
          <div
            key={i}
            className="card px-4 py-3 flex items-center gap-3.5 fade-in"
            style={{ borderColor: `${color}44`, animationDelay: `${i * 90}ms` }}
          >
            <span className="num text-[22px] font-semibold w-8 text-center" style={{ color }}>
              {i + 1}
            </span>
            <span className="text-[27px] font-medium">{k || "…"}</span>
          </div>
        ))}
      </div>

      {isHost && (
        <div className="max-w-sm mx-auto mt-5 space-y-2">
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => reshuffle(myTeam)}
            className="w-full card px-4 py-3 flex items-center justify-between text-start disabled:opacity-40"
            style={{ borderColor: `${color}44` }}
          >
            <span className="text-[13px]" style={{ color }}>
              خلط مفاتيح {TEAM_LABEL[myTeam]}
            </span>
            <span className="text-[12px] text-muted">{busy === myTeam ? "…" : "خلط"}</span>
          </button>
          <button
            type="button"
            disabled={busy !== null}
            onClick={() => reshuffle(other)}
            className="w-full card px-4 py-3 flex items-center justify-between text-start disabled:opacity-40"
            style={{ borderColor: `${TEAM_HEX[other]}44` }}
          >
            <span className="text-[13px]" style={{ color: TEAM_HEX[other] }}>
              خلط مفاتيح {TEAM_LABEL[other]}
              <span className="block text-[11px] text-muted mt-0.5">بدون عرض كلماتهم</span>
            </span>
            <span className="text-[12px] text-muted">{busy === other ? "…" : "خلط"}</span>
          </button>
        </div>
      )}

      {isHost && <HostContinue room={room} uid={uid} label="بدء التشفير" />}
    </div>
  );
}

/* ================================================================== */
/* encrypt                                                            */
/* ================================================================== */

export function EncryptPhase(ctx: Ctx) {
  const { room, uid, myTeam, keys, usedClues, code } = ctx;
  const amEncryptor = room.encryptor[myTeam] === uid;
  return amEncryptor
    ? <EncryptorView key={`${room.id}:${room.round}`} {...ctx} />
    : <EncryptWaiting {...ctx} />;
}

function EncryptorView({ room, myTeam, keys, usedClues, code, rounds, mySubmittedClues }: Ctx) {
  // Survives tab unmount (Game remounts the play tab). Cleared per round via key.
  const alreadyIn = room.cluesIn[myTeam] === true;
  const [clues, setClues] = useLocal<string[]>(
    `tashfeer.encryptClues.${room.id}.${room.round}`,
    ["", "", ""],
  );
  const [sentLocal, setSentLocal] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [focusIdx, setFocusIdx] = useState<number | null>(null);
  /** Digit 1–4 whose full past-clue list is open in the overlay. */
  const [pastOpen, setPastOpen] = useState<number | null>(null);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([null, null, null]);

  const sent = alreadyIn || sentLocal || Boolean(mySubmittedClues);

  useEffect(() => {
    if (mySubmittedClues && mySubmittedClues.length === 3) {
      setClues(mySubmittedClues);
      setSentLocal(true);
    }
  }, [mySubmittedClues]);

  const usedSet = useMemo(() => new Set(usedClues.map(normalizeAr)), [usedClues]);
  const keySet = useMemo(() => new Set((keys ?? []).map(normalizeKey)), [keys]);

  function problem(i: number): string | null {
    const raw = clues[i].trim();
    if (!raw) return null;
    if (keySet.has(normalizeKey(raw))) return "هذه إحدى كلماتكم";
    if (usedSet.has(normalizeAr(raw))) return "استُخدم في جولة سابقة";
    const dup = clues.findIndex((c, j) => j !== i && c.trim() && normalizeAr(c) === normalizeAr(raw));
    if (dup >= 0 && dup < i) return "مكرر";
    return null;
  }

  const filled = clues.every((c) => c.trim().length > 0);
  const clean = filled && [0, 1, 2].every((i) => !problem(i));
  const blockReason = !filled
    ? "أكمل التلميحات الثلاثة"
    : ([0, 1, 2].map(problem).find(Boolean) ?? null);

  async function send() {
    setBusy(true); setErr("");
    try {
      await api.submitClues({ roomId: room.id, clues: clues.map((c) => c.trim()) });
      setSentLocal(true);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  /**
   * iOS Safari scrolls a focused input toward the top of the visual
   * viewport (especially the last field). Undo that so the consolidated
   * encrypt layout stays put. Android must keep default scroll-into-view
   * — cancelling it buries lower fields under the keyboard.
   */
  function holdScrollOnFocus() {
    if (!/iPad|iPhone|iPod/.test(navigator.userAgent)) return;
    const scroller = document.querySelector(".scroll-y") as HTMLElement | null;
    const yWin = window.scrollY;
    const yMain = scroller?.scrollTop ?? 0;
    const restore = () => {
      if (window.scrollY !== yWin) window.scrollTo(0, yWin);
      if (scroller && scroller.scrollTop !== yMain) scroller.scrollTop = yMain;
    };
    restore();
    requestAnimationFrame(restore);
    window.setTimeout(restore, 50);
    window.setTimeout(restore, 150);
    window.setTimeout(restore, 350);
  }

  if (sent) {
    const shown =
      clues.some((c) => c.trim())
        ? clues
        : (mySubmittedClues ?? ["…", "…", "…"]);
    return (
      <div className="px-5 py-4 fade-in">
        <Empty title="أُرسلت تلميحاتك" body="بانتظار المُشفِّر الآخر. لا تلمّح لأحد بشيء." />
        <div className="max-w-sm mx-auto mt-1.5 space-y-1.5">
          {shown.map((c, i) => (
            <div key={i} className="card px-3 py-2 flex items-center gap-2.5">
              <span className="text-[10px] text-muted w-9 shrink-0">{ORDINALS[i]}</span>
              <span className="text-[15px] font-medium leading-snug">{c}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const lanes = buildLanes(rounds, myTeam, keys);
  const color = TEAM_HEX[myTeam];
  const warmSilver = myTeam === "silver";
  const inputBg = warmSilver ? "#2A1810" : "#1B1A14";
  const inputBorder = warmSilver ? "#6B4020" : "#3A3629";
  const inputPh = warmSilver ? "placeholder:text-[#6B5040]" : "placeholder:text-[#6E6858]";
  const pastLane = pastOpen != null ? lanes[pastOpen - 1] : null;

  return (
    <div className="px-3 pt-2 pb-4 fade-in">
      {!code && (
        <p className="text-[11px] text-muted text-center mb-2">جارٍ سحب الشفرة…</p>
      )}

      <div className="card encrypt-card overflow-hidden">
        {[0, 1, 2].map((i) => {
          const target = code?.[i];
          const word = target && keys ? keys[target - 1] : null;
          const issue = problem(i);
          const past = target ? lanes[target - 1].clues : [];
          const visible = past.slice(0, 2);
          const extra = past.length - visible.length;
          const on = focusIdx === i;
          const rowOk = clues[i].trim().length > 0 && !issue;
          return (
            <div key={i} data-clue-block className="encrypt-row">
              <div
                className="encrypt-target"
                style={{
                  borderColor: on ? `${color}99` : `${color}44`,
                  background: on ? `${color}18` : `${color}0A`,
                  color: word ? color : "#6E6858",
                }}
              >
                <span className="num encrypt-target-digit">{target ?? "—"}</span>
                <span className="encrypt-target-word" title={word ?? undefined}>
                  {word ?? "…"}
                </span>
              </div>

              <div className="encrypt-mid">
                <div className="encrypt-meta">
                  <span className="encrypt-ord text-muted">{ORDINALS[i]}</span>
                  {visible.map((c, k) => (
                    <span key={k} className="chip encrypt-past-chip" title={c.text}>
                      <span className="num text-[9px] text-muted">{c.round}</span>
                      {c.text}
                    </span>
                  ))}
                  {extra > 0 && (
                    <button
                      type="button"
                      className="chip encrypt-past-more"
                      onClick={() => target && setPastOpen(target)}
                      aria-label={`عرض ${extra} تلميحات سابقة إضافية`}
                    >
                      +{extra}
                    </button>
                  )}
                </div>
                <input
                  ref={(el) => { inputRefs.current[i] = el; }}
                  value={clues[i]}
                  maxLength={40}
                  enterKeyHint={i < 2 ? "next" : "done"}
                  autoComplete="off"
                  autoCorrect="off"
                  data-clue-input={i}
                  onChange={(e) => setClues((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                  onKeyDown={(e) => {
                    if (e.key !== "Enter") return;
                    e.preventDefault();
                    if (i < 2) {
                      inputRefs.current[i + 1]?.focus();
                      return;
                    }
                    (e.target as HTMLInputElement).blur();
                    if (clean) void send();
                  }}
                  onFocus={() => {
                    holdScrollOnFocus();
                    setFocusIdx(i);
                  }}
                  onBlur={(e) => {
                    const next = e.relatedTarget as HTMLElement | null;
                    if (next?.closest?.("[data-clue-input]") != null) return;
                    window.setTimeout(() => {
                      setFocusIdx((cur) => (cur === i ? null : cur));
                    }, 80);
                  }}
                  placeholder="تلميح"
                  className={`encrypt-input ${inputPh}`}
                  style={{
                    background: inputBg,
                    borderColor: issue ? "#D6564A" : on ? `${color}88` : inputBorder,
                    fontSize: "16px",
                  }}
                />
              </div>

              <div className="encrypt-check" aria-hidden>
                {rowOk ? <span style={{ color: "#8FAE5C" }}>✓</span> : null}
              </div>
            </div>
          );
        })}

        <div className="encrypt-foot">
          {err && <Banner tone="warn">{err}</Banner>}
          <Btn className="w-full !py-2.5" disabled={!clean || busy} onClick={send}>
            {busy ? "جارٍ الإرسال…" : "أرسل التلميحات"}
          </Btn>
          {!clean ? (
            <p
              className={`text-[10.5px] text-center leading-snug mt-1.5 ${
                filled ? "text-alarm" : "text-muted"
              }`}
            >
              {blockReason}
            </p>
          ) : (
            <p className="text-[10.5px] text-muted text-center leading-snug mt-1.5">
              ممنوع التلميح للهجاء أو عدد الحروف أو الترتيب.
            </p>
          )}
        </div>
      </div>

      {pastOpen != null && pastLane && (
        <div
          className="encrypt-past-sheet"
          role="dialog"
          aria-modal="true"
          aria-label="تلميحات سابقة"
          onClick={() => setPastOpen(null)}
        >
          <div
            className="card encrypt-past-panel"
            style={{ borderColor: `${color}55` }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <p className="text-[12px] font-medium" style={{ color }}>
                <span className="num me-1.5">{pastOpen}</span>
                {keys?.[pastOpen - 1] ?? "…"}
                <span className="text-muted font-normal text-[11px] ms-1.5">· السابق</span>
              </p>
              <button
                type="button"
                className="text-[11px] text-muted px-1"
                onClick={() => setPastOpen(null)}
              >
                إغلاق
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {pastLane.clues.map((c, k) => (
                <span key={k} className="chip !py-0.5 !px-2 !text-[12px]">
                  <span className="num text-[10px] text-muted">{c.round}</span>
                  {c.text}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {rounds.length > 0 && (
        <div className="mt-4 max-h-[40vh] overflow-y-auto overscroll-contain">
          <p className="text-[12px] text-muted mb-2 px-1">سجل تلميحاتكم</p>
          <ClueGrid lanes={lanes} team={myTeam} />
        </div>
      )}
    </div>
  );
}

function EncryptWaiting({ room, myTeam, rounds, keys }: Ctx) {
  const mine = room.encryptor[myTeam];
  const lanes = buildLanes(rounds, myTeam, keys);

  return (
    <div className="px-4 py-5 space-y-5 fade-in">
      <div className="card p-5 text-center">
        <p className="text-[20px] font-medium">
          {mine ? room.players[mine]?.name : "المُشفِّر"} يكتب التلميحات
        </p>
        <div className="flex justify-center gap-4 mt-4">
          {TEAMS.map((t) => (
            <span key={t} className="chip">
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{ background: room.cluesIn[t] ? "#6FBF95" : "#4A5680" }}
              />
              {TEAM_LABEL[t]}
              <span className="text-muted">{room.cluesIn[t] ? "جاهز" : "يكتب…"}</span>
            </span>
          ))}
        </div>
      </div>

      <div>
        <p className="text-[12px] text-muted mb-2 px-1">
          راجعوا تلميحاتكم السابقة — الخصم يحفظها كلها
        </p>
        {rounds.length === 0 ? (
          <Empty title="الجولة الأولى" body="لا سجلّ بعد. في هذه الجولة لا اعتراض على أحد." />
        ) : (
          <ClueGrid lanes={lanes} team={myTeam} />
        )}
      </div>
    </div>
  );
}

/* ================================================================== */
/* guess                                                              */
/* ================================================================== */

export function GuessPhase(ctx: Ctx) {
  const { room, uid, myTeam, keys, rounds, draft, actions, theories, setTheory } = ctx;
  // Round 1: both teams decrypt simultaneously — each owns their own half.
  const simultaneous = room.round < 2;
  const active = simultaneous ? myTeam : (room.activeTeam ?? "gold");
  const amOwner = myTeam === active;
  const amInterceptor = !simultaneous && myTeam === OTHER[active];
  const amEncryptor = room.encryptor[myTeam] === uid;

  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [localDecrypt, setLocalDecrypt] = useState<(number | null)[] | null>(null);
  const [localIntercept, setLocalIntercept] = useState<(number | null)[] | null>(null);

  useEffect(() => {
    if (!draft) {
      setLocalDecrypt(null);
      setLocalIntercept(null);
      return;
    }
    setLocalDecrypt(draft.decrypt);
    setLocalIntercept(draft.intercept);
  }, [draft, active, simultaneous]);

  const activeClues = room.clues[active] ?? [];
  const decrypt = localDecrypt ?? draft?.decrypt ?? [null, null, null];
  const intercept = localIntercept ?? draft?.intercept ?? [null, null, null];

  const sentBy = amOwner
    ? draft?.submittedDecrypt ?? null
    : draft?.submittedIntercept ?? null;
  const sent = Boolean(sentBy);
  const values = amOwner ? decrypt : intercept;
  const complete = values.every((v) => v != null);
  const field: "decrypt" | "intercept" = amOwner ? "decrypt" : "intercept";

  const ownerLanes = buildLanes(rounds, active, amOwner ? keys : null);

  async function setField(next: (number | null)[]) {
    if (amOwner) setLocalDecrypt(next);
    else setLocalIntercept(next);
    try {
      await actions?.setCode(field, next);
    } catch (e) {
      setErr(errText(e));
    }
  }

  async function send() {
    if (!actions || !complete || busy || sent) return;
    if (amOwner && amEncryptor) return;
    setBusy(true); setErr("");
    try {
      await actions.submit(uid, field);
    } catch (e) {
      setErr(errText(e));
    } finally {
      setBusy(false);
    }
  }

  const encUid = room.encryptor[active];
  const encName = encUid ? (room.players[encUid]?.name ?? "—") : "—";
  const encColor = TEAM_HEX[active];

  // Silent encryptor: no clue set → skip this team's guess entirely.
  if (amOwner && activeClues.length !== 3) {
    return (
      <div className="px-4 py-8 fade-in">
        <Empty
          title="لم تُعطَ تلميحات"
          body="مُشفِّركم لم يقدّم تلميحات — سوء تفاهم. لا اعتراض، واللعبة تتجاوز فكّ الشفرة لهذا الفريق."
        />
      </div>
    );
  }

  // Following rounds: while own team decrypts and the enemy intercepts the
  // clues this encryptor wrote — split spectate. Round 1 has no intercept.
  // When this team is intercepting, same board as teammates.
  if (!simultaneous && amOwner && amEncryptor) {
    return (
      <EncryptorGuessWatch
        room={room}
        myTeam={myTeam}
        keys={keys}
        rounds={rounds}
        decrypt={decrypt}
        activeClues={activeClues}
        sentBy={sentBy}
      />
    );
  }

  const lockedOut = amOwner && amEncryptor;

  return (
    <div className="px-4 pt-3 pb-4 space-y-3 fade-in">
      <Banner>
        {amOwner ? (
          <>
            <span className="font-bold">فكّوا شفرة فريقكم من:</span>{" "}
            <span className="font-bold" style={{ color: encColor }}>{encName}</span>
          </>
        ) : (
          <>
            <span className="font-bold">اعترضوا شفرة العدو من:</span>{" "}
            <span className="font-bold" style={{ color: encColor }}>{encName}</span>
          </>
        )}
      </Banner>

      {lockedOut && (
        <Banner tone="lock">
          أنت كتبت هذه التلميحات. لا تشارك في الفكّ ولا تُظهر أي ردّ فعل.
        </Banner>
      )}

      <Cartouche
        values={values}
        clues={activeClues.length === 3 ? activeClues : ["—", "—", "—"]}
        onChange={
          sent || lockedOut ? undefined : (next) => setField(next)
        }
        tone={active}
        keyWords={amOwner ? keys : null}
        guessWords={
          amInterceptor
            ? [1, 2, 3, 4].map((n) => theories[String(n)] ?? "")
            : null
        }
        historyByDigit={
          amInterceptor
            ? ownerLanes.map((lane) => lane.clues.map((c) => c.text))
            : null
        }
      />

      <p className="text-[11.5px] text-muted text-center">
        {sent
          ? "أُرسلت — لا يمكن التعديل"
          : lockedOut
          ? "بانتظار فريقك…"
          : "أي لاعب في فريقكم يستطيع تحريك الأرقام — الجميع يرى نفس الشاشة"}
      </p>

      {/* Same order as EncryptorView: pads → send → record. Not fixed —
          a fixed dock sits under the Android keyboard when ClueGrid
          theory inputs are focused. */}
      {err && <Banner tone="warn">{err}</Banner>}

      <div className="border-t border-line pt-3">
        {sent ? (
          <div className="flex items-center justify-center py-2">
            <span className="text-[13.5px] text-muted">
              أرسلها {room.players[sentBy!]?.name ?? "زميل"}
              {" — بانتظار الطرف الآخر"}
            </span>
          </div>
        ) : lockedOut ? (
          <p className="text-center text-[13px] text-muted py-3">
            بانتظار فريقك ليفكّ الشفرة…
          </p>
        ) : (
          <>
            <Btn className="w-full" disabled={!complete || busy} onClick={send}>
              {busy ? "جارٍ الإرسال…" : amOwner ? "أرسل فكّ الشفرة" : "أرسل الاعتراض"}
            </Btn>
            <p className="text-[11px] text-muted text-center mt-2 leading-relaxed">
              {complete
                ? "أي لاعب في الفريق يستطيع الإرسال — وبعدها تُقفل الأرقام"
                : "أكملوا الأرقام الثلاثة قبل الإرسال"}
            </p>
          </>
        )}
      </div>

      <SectionLine>
        {amOwner ? "سجلّكم" : `سجلّ ${TEAM_LABEL[active]}`}
      </SectionLine>
      <ClueGrid
        lanes={ownerLanes}
        team={active}
        theories={amInterceptor ? theories : undefined}
        onGuess={amInterceptor ? (n, t) => setTheory?.(n, t) : undefined}
      />
    </div>
  );
}

/**
 * Own-team decrypt half (round ≥ 2): encryptor watches teammates decrypt
 * and the enemy intercept board live (same clues/history they see).
 */
function EncryptorGuessWatch({
  room, myTeam, keys, rounds, decrypt, activeClues, sentBy,
}: {
  room: Room;
  myTeam: TeamId;
  keys: string[] | null;
  rounds: RoundRecord[];
  decrypt: (number | null)[];
  activeClues: string[];
  sentBy: string | null;
}) {
  const enemy = OTHER[myTeam];
  const mineColor = TEAM_HEX[myTeam];
  const enemyColor = TEAM_HEX[enemy];
  const myLanes = buildLanes(rounds, myTeam, keys);
  const { draft: enemyDraft } = useDraft(room.id, enemy, room.round);
  const enemyIntercept = enemyDraft?.intercept ?? [null, null, null];
  const enemySentBy = enemyDraft?.submittedIntercept ?? null;

  return (
    <div className="pb-20">
      <div className="px-3 pt-1.5 space-y-1.5 fade-in">
        <p className="rounded-lg border border-[#3A2A5A] bg-[#1A1230] px-2.5 py-1 text-[11px] leading-snug text-[#B49CD8] text-center">
          راقب فقط — لا تُظهر ردّ فعل
        </p>

        <section
          className="rounded-lg border px-2 py-1.5 space-y-1"
          style={{ borderColor: `${mineColor}66`, background: `${mineColor}0F` }}
        >
          <header className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold" style={{ color: mineColor }}>
              فريقكم: {TEAM_LABEL[myTeam]}
            </p>
            <span className="text-[9px] text-muted">يفكّون شفرتكم</span>
          </header>

          <Cartouche
            values={decrypt}
            clues={activeClues.length === 3 ? activeClues : ["—", "—", "—"]}
            tone={myTeam}
            keyWords={keys}
            showPads={false}
            size="dense"
          />
        </section>

        <section
          className="rounded-lg border px-2 py-1.5 space-y-1"
          style={{ borderColor: `${enemyColor}66`, background: `${enemyColor}0F` }}
        >
          <header className="flex items-center justify-between gap-2">
            <p className="text-[11px] font-bold" style={{ color: enemyColor }}>
              العدو: {TEAM_LABEL[enemy]}
            </p>
            <span className="text-[9px] text-muted">يعترضون · مباشر</span>
          </header>

          <Cartouche
            values={enemyIntercept}
            clues={activeClues.length === 3 ? activeClues : ["—", "—", "—"]}
            tone={enemy}
            historyByDigit={myLanes.map((lane) =>
              lane.clues.map((c) => c.text)
            )}
            showPads={false}
            size="dense"
          />
          <p className="text-[9px] text-muted text-center leading-tight">
            {enemySentBy
              ? `أرسل الاعتراض ${room.players[enemySentBy]?.name ?? "خصم"}`
              : "تشاهدون أرقامهم وهي تتحرّك"}
          </p>
        </section>
      </div>

      <div
        className="fixed inset-x-0 bg-ink/95 backdrop-blur-sm border-t border-line px-3 pt-1.5"
        style={{
          bottom: "calc(3.25rem + var(--safe-b))",
          paddingBottom: "6px",
        }}
      >
        <p className="text-center text-[11px] text-muted py-0.5 leading-snug">
          {sentBy
            ? `أرسلها ${room.players[sentBy]?.name ?? "زميل"} — بانتظار الطرف الآخر`
            : "بانتظار فريقك ليفكّ الشفرة…"}
        </p>
      </div>
    </div>
  );
}


function SectionLine({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <span className="text-[11.5px] text-muted whitespace-nowrap">{children}</span>
      <span className="flex-1 h-px bg-line" />
    </div>
  );
}

/* ================================================================== */
/* reveal                                                             */
/* ================================================================== */

export function RevealPhase({ room, uid, myTeam, rounds, keys }: Ctx) {
  const rec = rounds.find((r) => r.round === room.round);
  // Round 1 (and any dual reveal): activeTeam is null — show both sides.
  const dual = room.activeTeam == null;
  const teams: TeamId[] = dual ? TEAMS : [room.activeTeam ?? "gold"];

  if (!rec || teams.some((t) => !rec.data?.[t])) {
    return (
      <div className="px-4 py-8 pb-36">
        <Empty title="جارٍ الكشف…" />
        <HostContinue room={room} uid={uid} label="متابعة" />
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-3 pb-36">
      {teams.map((t) => (
        <RevealCard
          key={t}
          team={t}
          rec={rec}
          mine={t === myTeam}
          keys={t === myTeam ? keys : null}
          rounds={rounds}
          visible
          compact={dual}
        />
      ))}
      <HostContinue room={room} uid={uid} label="متابعة" />
    </div>
  );
}

function RevealCard({
  team, rec, mine, keys, rounds, visible, compact,
}: {
  team: TeamId;
  rec: RoundRecord;
  mine: boolean;
  keys: string[] | null;
  rounds: RoundRecord[];
  visible: boolean;
  compact?: boolean;
}) {
  const side = rec.data[team];
  const opp = OTHER[team];
  const color = TEAM_HEX[team];
  // On this card: outcomes that hurt `team` help the viewer when !mine.
  const goodForViewer = !mine;
  const hasBreach = side.wasBreached;
  const hasFault = side.faulted;
  const dramatic = hasBreach || hasFault;
  // Decrypting team: keywords under their digits.
  // Prior-round clues only — same history interceptors had while guessing
  // (current round's clues were shown above the slots, never filed under digits yet).
  // Encryptor's team also needs this on the intercept attempt cartouche.
  const keyWords = mine ? keys : null;
  const priorHistoryByDigit = buildLanes(rounds, team, null).map((lane) =>
    lane.clues.filter((c) => c.round < rec.round).map((c) => c.text)
  );
  const decryptHistory = mine ? null : priorHistoryByDigit;
  const decryptOk = codesEqual(side.decrypt, side.code);
  const interceptOk =
    rec.round >= 2 && codesEqual(side.intercept, side.code);

  if (!visible) {
    return <div className="card h-32 grid place-items-center text-[13px] text-muted">…</div>;
  }

  return (
    <div
      className={`card fade-in ${dramatic ? "reveal-card-hit" : ""} ${compact ? "p-3" : "p-4"}`}
      style={{
        borderColor: dramatic
          ? (goodForViewer ? "#8FAE5C66" : "#F03B2E66")
          : `${color}44`,
      }}
    >
      <div className={`flex items-center justify-between ${compact ? "mb-2" : "mb-3"} min-h-[2rem]`}>
        <span className={`font-display ${compact ? "text-[15px]" : "text-[16px]"}`} style={{ color }}>
          شفرة {TEAM_LABEL[team]}
          {mine && <span className="text-[11px] text-muted ms-2">فريقكم</span>}
        </span>
      </div>

      {side.noClues ? (
        <Banner tone="warn">
          لم يقدّم المُشفِّر تلميحات — سوء تفاهم (خلل). لا اعتراض.
        </Banner>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-col items-center">
            <p className="text-[11px] text-muted mb-1.5">الشفرة الحقيقية</p>
            <div className="w-full max-w-[20rem]">
              <Cartouche
                values={side.code}
                clues={side.clues}
                tone={team}
                showPads={false}
              />
            </div>
          </div>

          <div className="flex items-start gap-3 w-full">
            {(hasBreach || hasFault) && (
              <div className="reveal-stamps shrink-0" aria-label="نتائج الجولة">
                {hasBreach && (
                  <div className="flex flex-col items-center gap-1">
                    <Stamp kind="breach" good={goodForViewer} />
                    <span className="reveal-stamp-cap">
                      {mine
                        ? `اخترقكم ${TEAM_LABEL[opp]}`
                        : `اخترقتم ${TEAM_LABEL[team]}`}
                    </span>
                  </div>
                )}
                {hasFault && (
                  <div className="flex flex-col items-center gap-1">
                    <Stamp kind="fault" good={goodForViewer} />
                    <span className="reveal-stamp-cap">
                      {mine ? "خلل — أخطأتم" : `خلل — ${TEAM_LABEL[team]}`}
                    </span>
                  </div>
                )}
              </div>
            )}

            {/* ms-auto → visual left under dir=rtl */}
            <div className="w-[9.5rem] shrink-0 space-y-2 ms-auto">
              <div>
                <p className="text-[10px] text-muted mb-1 leading-none flex items-center gap-1.5">
                  <span>فكّ {TEAM_LABEL[team]}</span>
                  <AttemptMark ok={decryptOk} />
                </p>
                <Cartouche
                  values={side.decrypt}
                  tone={team}
                  truth={side.code}
                  keyWords={keyWords}
                  historyByDigit={decryptHistory}
                  showPads={false}
                  size="xs"
                />
              </div>
              {rec.round >= 2 && (
                <div>
                  <p className="text-[10px] text-muted mb-1 leading-none flex items-center gap-1.5">
                    <span>اعتراض {TEAM_LABEL[opp]}</span>
                    <AttemptMark ok={interceptOk} />
                  </p>
                  <Cartouche
                    values={side.intercept}
                    tone={opp}
                    truth={side.code}
                    keyWords={keyWords}
                    historyByDigit={priorHistoryByDigit}
                    showPads={false}
                    size="xs"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function AttemptMark({ ok }: { ok: boolean }) {
  return (
    <span
      className="num text-[13px] font-bold leading-none"
      style={{ color: ok ? "#8FAE5C" : "#F03B2E" }}
      aria-label={ok ? "صحيح" : "خطأ"}
    >
      {ok ? "✓" : "✗"}
    </span>
  );
}

/* ================================================================== */
/* round end                                                          */
/* ================================================================== */

export function RoundEndPhase({ room, uid, myTeam, rounds, away }: Ctx) {
  const isHost = room.hostUid === uid;
  const rec = rounds.find((r) => r.round === room.round);

  const wanderers = away
    .filter((a) => a.count > 0)
    .sort((a, b) => b.ms - a.ms)
    .slice(0, 5);

  const nextEncryptors = TEAMS.map((t) => {
    const m = room.teams[t].members;
    const next = m[(room.teams[t].encryptorIdx + 1) % Math.max(m.length, 1)];
    return { team: t, uid: next };
  });

  return (
    <div className="px-4 py-5 space-y-4 pb-36 fade-in">
      <div className="card p-4">
        <p className="text-[12px] text-muted mb-3">الحصيلة</p>
        <div className="space-y-2.5">
          {TEAMS.map((t) => {
            const s = room.teams[t].score;
            return (
              <div key={t} className="flex items-center justify-between">
                <span className="font-display text-[15px]" style={{ color: TEAM_HEX[t] }}>
                  {TEAM_LABEL[t]}
                </span>
                <span className="flex items-center gap-4 text-[12.5px]">
                  <span style={{ color: "#8FAE5C" }}>
                    اختراق <span className="num">{s.breach}</span>/<span className="num">{2}</span>
                  </span>
                  <span style={{ color: "#F03B2E" }}>
                    خلل <span className="num">{s.fault}</span>/<span className="num">{2}</span>
                  </span>
                </span>
              </div>
            );
          })}
        </div>
        <p className="text-[11.5px] text-muted mt-3.5 leading-relaxed border-t border-line pt-3">
          اختراقان يفوزان باللعبة. خللان يخسرانها.
        </p>
      </div>

      {wanderers.length > 0 && (
        <div className="card p-4" style={{ borderColor: "#7A4A2A" }}>
          <p className="text-[12px] mb-3" style={{ color: "#E0A46C" }}>
            من غادر الشاشة هذه الجولة
          </p>
          <div className="space-y-2">
            {wanderers.map((a) => (
              <div key={a.uid} className="flex items-center justify-between gap-2">
                <span className="truncate text-[14px]">
                  {room.players[a.uid]?.name ?? "؟"}
                </span>
                <span className="num text-[12px] text-muted shrink-0">
                  {a.count}× · {Math.round(a.ms / 1000)}ث
                </span>
              </div>
            ))}
          </div>
          <p className="text-[11px] text-muted mt-3 leading-relaxed">
            إشعار على الهاتف يُحتسب أيضًا. لقطات الشاشة لا يمكن رصدها من المتصفح.
          </p>
        </div>
      )}

      <div className="card p-4">
        <p className="text-[12px] text-muted mb-3">المُشفِّر في الجولة القادمة</p>
        <div className="space-y-2">
          {nextEncryptors.map(({ team, uid: u }) => (
            <div key={team} className="flex items-center justify-between gap-2">
              <span className="truncate text-[14px]">
                {room.players[u]?.name ?? "؟"}
              </span>
              <span className="text-[12px] shrink-0" style={{ color: TEAM_HEX[team] }}>
                {TEAM_LABEL[team]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {isHost && (
        <HostContinue
          room={room}
          uid={uid}
          label={room.winner ? "النتيجة النهائية" : "الجولة التالية"}
        />
      )}
    </div>
  );
}
