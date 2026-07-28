import { useEffect, useMemo, useState } from "react";
import { api, errText } from "../lib/firebase";
import { normalizeAr, normalizeKey, ORDINALS } from "../lib/arabic";
import type { AwayRecord, Draft, PlayerGuess, Room, RoundRecord, TeamId } from "../lib/types";
import { OTHER, TEAMS } from "../lib/types";
import { Cartouche } from "../components/Cartouche";
import { buildLanes, ClueGrid } from "../components/ClueGrid";
import { Banner, Btn, Empty, Stamp, TEAM_HEX, TEAM_LABEL } from "../components/ui";

interface Ctx {
  room: Room;
  uid: string;
  myTeam: TeamId;
  keys: string[] | null;
  usedClues: string[];
  rounds: RoundRecord[];
  draft: Draft | null;
  actions: {
    setCode: (f: "decrypt" | "intercept", values: (number | null)[]) => Promise<unknown>;
    submit: (uid: string, field: "decrypt" | "intercept") => Promise<unknown>;
  } | null;
  code: number[] | null;
  away: AwayRecord[];
  guesses: PlayerGuess[];
  setGuessWord: ((uid: string, n: string, text: string) => void) | null;
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
      className="fixed inset-x-0 bottom-0 bg-ink/95 backdrop-blur-sm border-t border-line px-4 pt-3 z-20"
      style={{ paddingBottom: "calc(var(--safe-b) + 10px)" }}
    >
      <Btn
        className="w-full"
        onClick={() =>
          api.advancePhase({
            roomId: room.id, force: true, fromPhase: room.phase, fromRound: room.round,
          }).catch(() => {})
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
  return amEncryptor ? <EncryptorView {...ctx} /> : <EncryptWaiting {...ctx} />;
}

function EncryptorView({ room, myTeam, keys, usedClues, code, rounds }: Ctx) {
  const [clues, setClues] = useState(["", "", ""]);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [focusIdx, setFocusIdx] = useState<number | null>(null);

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

  async function send() {
    setBusy(true); setErr("");
    try {
      await api.submitClues({ roomId: room.id, clues: clues.map((c) => c.trim()) });
      setSent(true);
    } catch (e) { setErr(errText(e)); } finally { setBusy(false); }
  }

  /**
   * Mobile browsers scroll a focused input toward the top of the visual
   * viewport (especially the last field). Undo that so the consolidated
   * encrypt layout stays put.
   */
  function holdScrollOnFocus() {
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
    return (
      <div className="px-5 py-8 fade-in">
        <Empty title="أُرسلت تلميحاتك" body="بانتظار المُشفِّر الآخر. لا تلمّح لأحد بشيء." />
        <div className="max-w-sm mx-auto mt-2 space-y-2">
          {clues.map((c, i) => (
            <div key={i} className="card px-4 py-3 flex items-center gap-3">
              <span className="text-[11px] text-muted w-10 shrink-0">{ORDINALS[i]}</span>
              <span className="text-[22px] font-medium">{c}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  const lanes = buildLanes(rounds, myTeam, keys);
  const color = TEAM_HEX[myTeam];

  return (
    <div className="px-3 pt-2 pb-4 fade-in">
      {/* Centered code + lit keywords — order is the job; strip above lights the set. */}
      <div className="flex justify-center gap-4 mb-3 px-1">
        {(code ?? [null, null, null]).map((d, i) => {
          const word = d && keys ? keys[d - 1] : null;
          const on = focusIdx === i;
          return (
            <div key={i} className="flex flex-col items-center gap-1 min-w-[4.5rem]">
              <span
                className={`num font-semibold w-9 h-9 grid place-items-center rounded-lg border transition ${
                  on ? "border-gold text-parch text-[18px]" : "border-line text-muted text-[16px]"
                }`}
              >
                {d ?? "—"}
              </span>
              <span
                className={`text-center font-medium leading-tight transition ${
                  on ? "text-[16px]" : "text-[14px]"
                }`}
                style={{ color: word ? color : "#4A5680" }}
              >
                {word ?? (code ? "…" : "…")}
              </span>
              <span className="text-[9px] text-muted">{ORDINALS[i]}</span>
            </div>
          );
        })}
      </div>
      {!code && (
        <p className="text-[11px] text-muted text-center mb-2">جارٍ سحب الشفرة…</p>
      )}

      <div className="space-y-2">
        {[0, 1, 2].map((i) => {
          const target = code?.[i];
          const word = target && keys ? keys[target - 1] : null;
          const issue = problem(i);
          const past = target ? lanes[target - 1].clues : [];
          const on = focusIdx === i;
          return (
            <div key={i} data-clue-block className="clue-block">
              <div className="flex items-center gap-1.5 mb-1 px-0.5">
                <span className="text-[10px] text-muted shrink-0">
                  التلميح {ORDINALS[i]}
                </span>
                {word && (
                  <span
                    className={`chip !py-0.5 !px-2 !text-[14px] font-medium transition ${
                      on ? "" : "opacity-90"
                    }`}
                    style={{
                      borderColor: on ? `${color}99` : `${color}55`,
                      background: on ? `${color}18` : undefined,
                      color,
                    }}
                  >
                    <span className="num text-[12px]">{target}</span>
                    {word}
                  </span>
                )}
                <span className="flex-1 h-px bg-line" />
              </div>

              {past.length > 0 ? (
                <div className="flex flex-wrap items-center gap-1 mb-1 px-0.5">
                  {past.map((c, k) => (
                    <span key={k} className="chip !py-0 !px-1.5 !text-[11px]">
                      <span className="num text-[9px] text-muted">{c.round}</span>
                      {c.text}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-[10px] text-muted mb-1 px-0.5">لا سابق</p>
              )}

              <input
                value={clues[i]}
                maxLength={40}
                enterKeyHint={i < 2 ? "next" : "done"}
                autoComplete="off"
                autoCorrect="off"
                onChange={(e) => setClues((c) => c.map((v, j) => (j === i ? e.target.value : v)))}
                onFocus={() => {
                  holdScrollOnFocus();
                  setFocusIdx(i);
                }}
                onBlur={() => {
                  window.setTimeout(() => {
                    setFocusIdx((cur) => (cur === i ? null : cur));
                  }, 80);
                }}
                placeholder="تلميح"
                className="w-full bg-[#0C1330] rounded-md px-2.5 py-1.5 font-medium text-parch
                           placeholder:text-[#4A5680] focus:outline-none transition border"
                style={{
                  borderColor: issue ? "#D6564A" : "#25335F",
                  // 16px avoids iOS zoom-on-focus.
                  fontSize: "16px",
                }}
              />
              {issue && <p className="text-[10px] text-alarm mt-0.5 px-0.5">{issue}</p>}
            </div>
          );
        })}
      </div>

      {err && <Banner tone="warn">{err}</Banner>}

      <Btn className="w-full mt-2.5 !py-2.5" disabled={!clean || busy} onClick={send}>
        {busy ? "جارٍ الإرسال…" : "أرسل التلميحات"}
      </Btn>
      <p className="text-[10.5px] text-muted text-center leading-snug mt-1.5">
        ممنوع التلميح للهجاء أو عدد الحروف أو الترتيب.
      </p>
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
  const { room, uid, myTeam, keys, rounds, draft, actions, guesses, setGuessWord } = ctx;
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

  const names = Object.fromEntries(
    Object.entries(room.players).map(([u, p]) => [u, p.name])
  );
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

  return (
    <div className="pb-36">
      <div className="px-4 pt-3 space-y-3 fade-in">
        <Banner>
          {amOwner ? (
            <>
              فكّوا شفرة فريقكم، من{" "}
              <span className="font-medium" style={{ color: encColor }}>{encName}</span>
            </>
          ) : (
            <>
              اعترضوا شفرة الخصم، من{" "}
              <span className="font-medium" style={{ color: encColor }}>{encName}</span>
            </>
          )}
        </Banner>

        {amOwner && amEncryptor && (
          <Banner tone="lock">
            أنت كتبت هذه التلميحات. لا تشارك في الفكّ ولا تُظهر أي ردّ فعل.
          </Banner>
        )}

        <Cartouche
          values={values}
          clues={activeClues.length === 3 ? activeClues : ["—", "—", "—"]}
          onChange={
            sent || (amOwner && amEncryptor) ? undefined : (next) => setField(next)
          }
          tone={active}
          keyWords={amOwner ? keys : null}
          historyByDigit={
            amInterceptor
              ? ownerLanes.map((lane) => lane.clues.map((c) => c.text))
              : null
          }
        />

        <p className="text-[11.5px] text-muted text-center">
          {sent
            ? "أُرسلت — لا يمكن التعديل"
            : amOwner && amEncryptor
            ? "بانتظار فريقك…"
            : "أي لاعب في فريقكم يستطيع تحريك الأرقام — الجميع يرى نفس الشاشة"}
        </p>

        <SectionLine>
          {amOwner ? "سجلّكم" : `سجلّ ${TEAM_LABEL[active]}`}
        </SectionLine>
        <ClueGrid
          lanes={ownerLanes}
          team={active}
          guesses={amInterceptor ? guesses : undefined}
          myUid={amInterceptor ? uid : undefined}
          names={amInterceptor ? names : undefined}
          onGuess={amInterceptor ? (n, t) => setGuessWord?.(uid, n, t) : undefined}
        />

        {err && <Banner tone="warn">{err}</Banner>}
      </div>

      <div
        className="fixed inset-x-0 bg-ink/95 backdrop-blur-sm border-t border-line px-4 pt-3"
        style={{
          bottom: "calc(3.25rem + var(--safe-b))",
          paddingBottom: "10px",
        }}
      >
        {sent ? (
          <div className="flex items-center justify-center py-2">
            <span className="text-[13.5px] text-muted">
              أرسلها {room.players[sentBy!]?.name ?? "زميل"}
              {simultaneous ? " — بانتظار الفريق الآخر" : " — بانتظار الطرف الآخر"}
            </span>
          </div>
        ) : amOwner && amEncryptor ? (
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

export function RevealPhase({ room, uid, myTeam, rounds }: Ctx) {
  const rec = rounds.find((r) => r.round === room.round);
  // Round 1 (and any dual reveal): activeTeam is null — show both sides.
  const dual = room.activeTeam == null;
  const teams: TeamId[] = dual ? TEAMS : [room.activeTeam ?? "gold"];

  if (!rec || teams.some((t) => !rec.data?.[t])) {
    return <Empty title="جارٍ الكشف…" />;
  }

  return (
    <div className="px-4 py-4 space-y-3 pb-28">
      {teams.map((t) => (
        <RevealCard
          key={t}
          team={t}
          rec={rec}
          mine={t === myTeam}
          visible
          compact={dual}
        />
      ))}
      <HostContinue room={room} uid={uid} label="متابعة" />
    </div>
  );
}

function RevealCard({
  team, rec, mine, visible, compact,
}: {
  team: TeamId; rec: RoundRecord; mine: boolean;
  visible: boolean; compact?: boolean;
}) {
  const side = rec.data[team];
  const opp = OTHER[team];
  const color = TEAM_HEX[team];
  // On this card: outcomes that hurt `team` help the viewer when !mine.
  const goodForViewer = !mine;
  const hasBreach = side.wasBreached;
  const hasFault = side.faulted;
  const dramatic = hasBreach || hasFault;

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

      {(hasBreach || hasFault) && (
        <div className="reveal-outcomes">
          {hasBreach && (
            <div className="reveal-outcome" style={{ animationDelay: "0.08s" }}>
              <Stamp kind="breach" good={goodForViewer} />
              <span className="reveal-outcome-copy">
                {mine
                  ? `اخترقكم ${TEAM_LABEL[opp]}`
                  : `اخترقتم شفرة ${TEAM_LABEL[team]}`}
              </span>
            </div>
          )}
          {hasFault && (
            <div
              className="reveal-outcome"
              style={{ animationDelay: hasBreach ? "0.28s" : "0.08s" }}
            >
              <Stamp kind="fault" good={goodForViewer} />
              <span className="reveal-outcome-copy">
                {mine
                  ? "خلل — فريقكم أخطأ في فكّ الشفرة"
                  : `خلل — ${TEAM_LABEL[team]} أخطأوا في فكّ شفرتهم`}
              </span>
            </div>
          )}
        </div>
      )}

      {side.noClues ? (
        <Banner tone="warn">
          لم يقدّم المُشفِّر تلميحات — سوء تفاهم (خلل). لا اعتراض.
        </Banner>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5 mb-3.5">
            {side.clues.map((c, i) => (
              <span key={i} className="chip">
                <span className="text-[10px] text-muted">{ORDINALS[i]}</span>
                {c}
              </span>
            ))}
          </div>

          <div className="mb-3">
            <p className="text-[11px] text-muted mb-1.5">الشفرة الحقيقية</p>
            <Cartouche values={side.code} tone={team} />
          </div>

          <div className="space-y-2 pt-1">
            <GuessRow
              label={`${TEAM_LABEL[team]} فكّها`}
              guess={side.decrypt}
              truth={side.code}
            />
            {rec.round >= 2 && (
              <GuessRow
                label={`اعتراض ${TEAM_LABEL[opp]}`}
                guess={side.intercept}
                truth={side.code}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}

function GuessRow({
  label, guess, truth,
}: { label: string; guess: (number | null)[]; truth: number[] }) {
  const hit = guess.every((g, i) => g === truth[i]);
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-[12.5px] text-muted truncate">{label}</span>
      <span className="flex items-center gap-1.5 shrink-0">
        {guess.map((g, i) => {
          const ok = g === truth[i];
          return (
            <span
              key={i}
              className="num w-8 h-8 grid place-items-center rounded-md text-[15px] font-display border"
              style={{
                borderColor: ok ? "#8FAE5C88" : "#F03B2E66",
                background: ok ? "#8FAE5C18" : "#F03B2E12",
                color: ok ? "#8FAE5C" : "#F03B2E",
              }}
            >
              {g == null ? "—" : g}
            </span>
          );
        })}
        <span className="text-[14px] ms-1" style={{ color: hit ? "#6FBF95" : "#E57A6F" }}>
          {hit ? "✓" : "✕"}
        </span>
      </span>
    </div>
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
    <div className="px-4 py-5 space-y-4 pb-28 fade-in">
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
